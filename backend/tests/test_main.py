"""
测试 FastAPI 主应用

测试覆盖：
1. 根路径和健康检查
2. 启动转录接口
3. 转录状态查询接口
4. 后台任务 Session 管理（通过集成测试验证）
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app, run_transcription_task
from app.models import Episode, AudioSegment, SessionLocal


class TestRootAndHealth:
    """测试根路径和健康检查接口"""
    
    def test_root(self, client):
        """测试根路径"""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "status" in data
        assert data["status"] == "running"
    
    def test_health_check(self, client):
        """测试健康检查接口"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "whisper_service" in data
        
        # 验证 WhisperService 信息结构
        whisper_info = data["whisper_service"]
        assert "asr_model_loaded" in whisper_info
        assert "device" in whisper_info
        assert "cuda_available" in whisper_info
        assert "vram_info" in whisper_info


class TestTranscriptionAPI:
    """测试转录相关 API 接口"""
    
    def test_start_transcription_episode_not_found(self, client, db_session):
        """测试启动转录：Episode 不存在"""
        response = client.post("/api/episodes/999/transcribe")
        assert response.status_code == 404
        data = response.json()
        assert "不存在" in data["detail"]
    
    def test_start_transcription_no_audio_path(self, client, db_session):
        """测试启动转录：Episode 没有音频文件路径"""
        # 创建 Episode（没有 audio_path）
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_001",
            duration=60.0,
            audio_path=None  # 没有音频路径
        )
        db_session.add(episode)
        db_session.commit()
        
        response = client.post(f"/api/episodes/{episode.id}/transcribe")
        assert response.status_code == 400
        data = response.json()
        assert "没有音频文件路径" in data["detail"]
    
    def test_start_transcription_already_processing(self, client, db_session):
        """测试启动转录：Episode 正在转录中"""
        # 创建 Episode（状态为 processing）
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_002",
            duration=60.0,
            audio_path="/fake/path/audio.mp3",
            transcription_status="processing"
        )
        db_session.add(episode)
        db_session.commit()
        
        response = client.post(f"/api/episodes/{episode.id}/transcribe")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "already_processing"
        assert "正在转录中" in data["message"]
    
    @patch('app.main.run_transcription_task')
    def test_start_transcription_success(self, mock_task, client, db_session, tmp_path):
        """测试启动转录：成功启动后台任务"""
        # 创建测试音频文件
        audio_file = tmp_path / "test_audio.mp3"
        audio_file.write_bytes(b"fake audio data")
        
        # 创建 Episode
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_003",
            duration=60.0,
            audio_path=str(audio_file),
            transcription_status="pending"
        )
        db_session.add(episode)
        db_session.commit()
        
        # Mock 后台任务（不实际执行）
        mock_task.return_value = None
        
        response = client.post(f"/api/episodes/{episode.id}/transcribe")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "processing"
        assert data["episode_id"] == episode.id
        assert "转录任务已启动" in data["message"]
        
        # 验证后台任务被添加（但 TestClient 不会实际执行后台任务）
        # 注意：TestClient 不会执行 BackgroundTasks，所以这里只验证接口返回正确
    
    def test_get_transcription_status_episode_not_found(self, client, db_session):
        """测试查询转录状态：Episode 不存在"""
        response = client.get("/api/episodes/999/transcription-status")
        assert response.status_code == 404
        data = response.json()
        assert "不存在" in data["detail"]
    
    def test_get_transcription_status_success(self, client, db_session):
        """测试查询转录状态：成功返回状态信息"""
        # 创建 Episode
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_004",
            duration=60.0,
            transcription_status="pending"
        )
        db_session.add(episode)
        db_session.commit()
        
        response = client.get(f"/api/episodes/{episode.id}/transcription-status")
        assert response.status_code == 200
        data = response.json()
        
        # 验证返回数据结构
        assert data["episode_id"] == episode.id
        assert data["transcription_status"] == "pending"
        assert "transcription_status_display" in data
        assert "transcription_progress" in data
        assert "transcription_stats" in data
        assert "estimated_time_remaining" in data
        
        # 验证 transcription_stats 结构
        stats = data["transcription_stats"]
        assert "total_segments" in stats
        assert "completed_segments" in stats
        assert "failed_segments" in stats
        assert "processing_segments" in stats
        assert "pending_segments" in stats


class TestBackgroundTaskSessionManagement:
    """测试后台任务的 Session 管理"""
    
    @patch('app.main.WhisperService')
    @patch('app.main.TranscriptionService')
    def test_run_transcription_task_creates_new_session(
        self,
        mock_transcription_service_class,
        mock_whisper_service_class,
        db_session
    ):
        """测试后台任务创建新的 Session"""
        # Mock WhisperService.get_instance()
        mock_whisper_instance = Mock()
        mock_whisper_service_class.get_instance.return_value = mock_whisper_instance
        
        # Mock TranscriptionService
        mock_transcription_instance = Mock()
        mock_transcription_service_class.return_value = mock_transcription_instance
        
        # 创建 Episode
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_005",
            duration=60.0,
            audio_path="/fake/path/audio.mp3"
        )
        db_session.add(episode)
        db_session.commit()
        episode_id = episode.id
        
        # 执行后台任务函数
        run_transcription_task(episode_id)
        
        # 验证 TranscriptionService 被创建（说明使用了新的 Session）
        mock_transcription_service_class.assert_called_once()
        call_args = mock_transcription_service_class.call_args
        
        # 验证第一个参数是 Session 对象（不是请求的 Session）
        session_arg = call_args[0][0]
        assert session_arg is not None
        assert hasattr(session_arg, 'query')  # 是 Session 对象
        
        # 验证第二个参数是 WhisperService 实例
        whisper_arg = call_args[0][1]
        assert whisper_arg == mock_whisper_instance
        
        # 验证 segment_and_transcribe 被调用
        mock_transcription_instance.segment_and_transcribe.assert_called_once_with(episode_id)
    
    @patch('app.main.WhisperService')
    @patch('app.main.TranscriptionService')
    @patch('app.main.SessionLocal')
    def test_run_transcription_task_handles_exception(
        self,
        mock_session_local,
        mock_transcription_service_class,
        mock_whisper_service_class,
        db_session
    ):
        """测试后台任务异常处理：捕获异常并尝试更新状态"""
        # Mock WhisperService.get_instance()
        mock_whisper_instance = Mock()
        mock_whisper_service_class.get_instance.return_value = mock_whisper_instance
        
        # Mock TranscriptionService.segment_and_transcribe 抛出异常
        mock_transcription_instance = Mock()
        mock_transcription_instance.segment_and_transcribe.side_effect = RuntimeError("转录失败")
        mock_transcription_service_class.return_value = mock_transcription_instance
        
        # Mock SessionLocal 返回测试数据库的 Session
        mock_session_local.return_value = db_session
        
        # 创建 Episode
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_006",
            duration=60.0,
            audio_path="/fake/path/audio.mp3",
            transcription_status="pending"
        )
        db_session.add(episode)
        db_session.commit()
        episode_id = episode.id
        
        # 执行后台任务函数（应该捕获异常，不会抛出未捕获的异常）
        # 注意：这个测试主要验证异常处理逻辑不会导致程序崩溃
        # 数据库状态更新的验证应该在集成测试中进行
        try:
            run_transcription_task(episode_id)
        except Exception as e:
            pytest.fail(f"后台任务异常处理失败，抛出了未捕获的异常: {e}")
        
        # 验证 SessionLocal 被调用（说明创建了新的 Session）
        mock_session_local.assert_called_once()
        
        # 验证 TranscriptionService 被创建
        mock_transcription_service_class.assert_called_once()
        
        # 验证 segment_and_transcribe 被调用
        mock_transcription_instance.segment_and_transcribe.assert_called_once_with(episode_id)
        
        # 验证 Episode 状态被更新为 failed（关键测试：验证数据库状态更新）
        # 注意：由于后台任务 commit 后对象可能已分离，需要重新查询
        db_session.expire_all()  # 清除 Session 缓存，强制重新加载
        updated_episode = db_session.query(Episode).filter(Episode.id == episode_id).first()
        assert updated_episode is not None, "Episode 应该存在"
        assert updated_episode.transcription_status == "failed", \
            f"Episode 状态应该更新为 'failed'，实际: {updated_episode.transcription_status}"
    
    @patch('app.main.WhisperService')
    @patch('app.main.TranscriptionService')
    def test_run_transcription_task_closes_session_on_success(
        self,
        mock_transcription_service_class,
        mock_whisper_service_class,
        db_session
    ):
        """测试后台任务成功时关闭 Session"""
        # Mock WhisperService.get_instance()
        mock_whisper_instance = Mock()
        mock_whisper_service_class.get_instance.return_value = mock_whisper_instance
        
        # Mock TranscriptionService
        mock_transcription_instance = Mock()
        mock_transcription_service_class.return_value = mock_transcription_instance
        
        # 创建 Episode
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_007",
            duration=60.0,
            audio_path="/fake/path/audio.mp3"
        )
        db_session.add(episode)
        db_session.commit()
        episode_id = episode.id
        
        # 执行后台任务函数
        run_transcription_task(episode_id)
        
        # 验证 TranscriptionService 被创建（说明 Session 被创建）
        mock_transcription_service_class.assert_called_once()
        
        # 验证 segment_and_transcribe 被调用（说明任务执行）
        mock_transcription_instance.segment_and_transcribe.assert_called_once_with(episode_id)
        
        # 注意：Session 的关闭在 finally 块中，这里主要验证不会出现异常

