"""
Episode 管理 API 单元测试

使用 mock 和临时文件进行快速单元测试，不依赖真实音频文件。

测试覆盖：
1. 文件上传（格式验证、大小限制）
2. 文件去重（MD5 hash 唯一性）
3. 异步 MD5 计算（不阻塞其他请求）
4. Episode CRUD（创建、查询、列表、详情）
5. 转录进度查询

注意：
- 这些测试使用 mock 和临时文件，运行速度快
- 真实文件测试请参见 test_episode_api_integration.py
"""
import pytest
import time
import hashlib
import threading
from pathlib import Path
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from io import BytesIO

from app.models import Episode, Podcast, TranscriptCue


@pytest.mark.unit
class TestFileUpload:
    """测试文件上传功能（单元测试 - 使用 mock 和临时文件）"""
    
    def test_upload_episode_success(self, client, db_session, tmp_path):
        """测试上传音频文件：成功"""
        # 创建测试音频文件（模拟 MP3 文件）
        audio_file = tmp_path / "test_audio.mp3"
        audio_file.write_bytes(b"fake mp3 audio data" * 100)
        
        # Mock 音频时长获取（避免依赖 pydub）
        # 注意：需要 mock app.api.get_audio_duration，因为 api.py 中直接导入了这个函数
        with patch('app.api.get_audio_duration', return_value=180.0):
            # Mock 存储路径（使用临时目录）
            with patch('app.config.AUDIO_STORAGE_PATH', str(tmp_path / "audios")):
                # 上传文件
                with open(audio_file, "rb") as f:
                    response = client.post(
                        "/api/episodes/upload",
                        files={"file": ("test_audio.mp3", f, "audio/mpeg")},
                        data={"title": "Test Episode"}
                    )
                
                assert response.status_code == 200
                data = response.json()
                assert "episode_id" in data
                assert data["status"] in ["processing", "pending"]
                assert data["is_duplicate"] is False
                
                # 验证数据库记录
                episode = db_session.query(Episode).filter(Episode.id == data["episode_id"]).first()
                assert episode is not None
                assert episode.title == "Test Episode"
    
    def test_upload_episode_invalid_format(self, client, db_session, tmp_path):
        """测试上传音频文件：不支持的文件格式"""
        # 创建不支持的文件格式
        invalid_file = tmp_path / "test.txt"
        invalid_file.write_bytes(b"not an audio file")
        
        with open(invalid_file, "rb") as f:
            response = client.post(
                "/api/episodes/upload",
                files={"file": ("test.txt", f, "text/plain")},
                data={"title": "Test Episode"}
            )
        
        assert response.status_code == 400
        data = response.json()
        assert "不支持的文件格式" in data["detail"] or "file format" in data["detail"].lower()
    
    def test_upload_episode_file_too_large(self, client, db_session, tmp_path):
        """测试上传音频文件：文件大小超过限制"""
        # 创建超大文件（超过 1GB）
        large_file = tmp_path / "large_audio.mp3"
        # 写入 1.1GB 数据（模拟）
        large_file.write_bytes(b"x" * (1024 * 1024 * 1100))
        
        with open(large_file, "rb") as f:
            response = client.post(
                "/api/episodes/upload",
                files={"file": ("large_audio.mp3", f, "audio/mpeg")},
                data={"title": "Test Episode"}
            )
        
        assert response.status_code == 400
        data = response.json()
        assert "文件大小超过限制" in data["detail"] or "file size" in data["detail"].lower()
    
    def test_upload_episode_missing_title(self, client, db_session, tmp_path):
        """测试上传音频文件：缺少必需字段（title）"""
        audio_file = tmp_path / "test_audio.mp3"
        audio_file.write_bytes(b"fake audio data")
        
        with open(audio_file, "rb") as f:
            response = client.post(
                "/api/episodes/upload",
                files={"file": ("test_audio.mp3", f, "audio/mpeg")}
                # 缺少 title 字段
            )
        
        assert response.status_code == 422  # FastAPI 验证错误


@pytest.mark.unit
class TestFileDeduplication:
    """测试文件去重功能（单元测试 - 使用 mock 和临时文件）"""
    
    def test_upload_duplicate_file(self, client, db_session, tmp_path):
        """测试上传相同文件两次：返回已存在的 Episode"""
        # 创建测试音频文件
        audio_file = tmp_path / "test_audio.mp3"
        audio_content = b"fake mp3 audio data" * 100
        audio_file.write_bytes(audio_content)
        
        # 计算 MD5（用于验证）
        file_hash = hashlib.md5(audio_content).hexdigest()
        
        # Mock 音频时长获取（mock app.api 中的导入，因为 api.py 直接导入了函数）
        with patch('app.api.get_audio_duration', return_value=180.0):
            # Mock 存储路径（使用临时目录）
            with patch('app.config.AUDIO_STORAGE_PATH', str(tmp_path / "audios")):
                # 第一次上传
                with open(audio_file, "rb") as f:
                    response1 = client.post(
                        "/api/episodes/upload",
                        files={"file": ("test_audio.mp3", f, "audio/mpeg")},
                        data={"title": "First Upload"}
                    )
                
                assert response1.status_code == 200
                data1 = response1.json()
                episode_id_1 = data1["episode_id"]
                assert data1["is_duplicate"] is False
                
                # 第二次上传相同文件
                with open(audio_file, "rb") as f:
                    response2 = client.post(
                        "/api/episodes/upload",
                        files={"file": ("test_audio.mp3", f, "audio/mpeg")},
                        data={"title": "Second Upload"}
                    )
                
                assert response2.status_code == 200
                data2 = response2.json()
                assert data2["is_duplicate"] is True
                assert data2["episode_id"] == episode_id_1  # 返回已存在的 Episode
                
                # 验证数据库中只有一个 Episode（相同 file_hash）
                episodes = db_session.query(Episode).filter(Episode.file_hash == file_hash).all()
                assert len(episodes) == 1
    
    def test_file_hash_uniqueness(self, client, db_session, tmp_path):
        """测试 file_hash 唯一性约束"""
        # 创建 Episode（已有 file_hash）
        existing_episode = Episode(
            title="Existing Episode",
            file_hash="duplicate_hash_123",
            duration=180.0,
            audio_path=str(tmp_path / "existing.mp3")
        )
        db_session.add(existing_episode)
        db_session.commit()
        
        # 尝试创建相同 file_hash 的 Episode（应该失败）
        duplicate_episode = Episode(
            title="Duplicate Episode",
            file_hash="duplicate_hash_123",  # 相同的 hash
            duration=200.0,
            audio_path=str(tmp_path / "duplicate.mp3")
        )
        db_session.add(duplicate_episode)
        
        # 应该抛出 IntegrityError（唯一性约束）
        with pytest.raises(Exception):  # IntegrityError 或类似的数据库错误
            db_session.commit()
        
        db_session.rollback()


@pytest.mark.unit
class TestAsyncMD5Calculation:
    """测试异步 MD5 计算（Critical - 不阻塞其他请求）（单元测试 - 使用 mock）"""
    
    def test_md5_calculation_non_blocking(self, client, db_session, tmp_path):
        """测试 MD5 计算期间，其他 API 请求仍能正常响应"""
        # 创建大文件（模拟 100MB，用于测试 MD5 计算耗时）
        large_file = tmp_path / "large_audio.mp3"
        # 写入 10MB 数据（测试环境，避免实际创建 100MB）
        large_content = b"x" * (10 * 1024 * 1024)
        large_file.write_bytes(large_content)
        
        # Mock 音频时长获取（mock app.api 中的导入，因为 api.py 直接导入了函数）
        with patch('app.api.get_audio_duration', return_value=180.0):
            # Mock 存储路径（使用临时目录）
            with patch('app.config.AUDIO_STORAGE_PATH', str(tmp_path / "audios")):
                # 启动上传任务（在后台线程中执行，模拟异步）
                upload_started = threading.Event()
                upload_completed = threading.Event()
                
                def upload_file():
                    upload_started.set()
                    with open(large_file, "rb") as f:
                        client.post(
                            "/api/episodes/upload",
                            files={"file": ("large_audio.mp3", f, "audio/mpeg")},
                            data={"title": "Large File"}
                        )
                    upload_completed.set()
                
                upload_thread = threading.Thread(target=upload_file)
                upload_thread.start()
                
                # 等待上传开始（确保 MD5 计算已开始）
                upload_started.wait(timeout=1.0)
                
                # 在上传进行中，发送其他 API 请求
                start_time = time.time()
                response = client.get("/api/episodes")
                end_time = time.time()
                
                response_time = (end_time - start_time) * 1000  # 转换为毫秒
                
                # 验证其他请求能正常响应
                assert response.status_code == 200
                
                # 验证响应时间 < 100ms（不被 MD5 计算阻塞）
                assert response_time < 100, f"响应时间 {response_time}ms 超过 100ms，可能被阻塞"
                
                # 等待上传完成
                upload_completed.wait(timeout=10.0)
                upload_thread.join()
    
    def test_concurrent_uploads(self, client, db_session, tmp_path):
        """测试并发上传多个文件：所有文件都能正常计算 MD5（无死锁）"""
        # 创建 3 个不同的测试文件
        files = []
        for i in range(3):
            audio_file = tmp_path / f"test_audio_{i}.mp3"
            audio_content = f"fake audio data {i}".encode() * 1000
            audio_file.write_bytes(audio_content)
            files.append((audio_file, audio_content))
        
        # Mock 音频时长获取（mock app.api 中的导入，因为 api.py 直接导入了函数）
        with patch('app.api.get_audio_duration', return_value=180.0):
            # Mock 存储路径（使用临时目录）
            with patch('app.config.AUDIO_STORAGE_PATH', str(tmp_path / "audios")):
                # 并发上传 3 个文件
                results = []
                errors = []
                
                def upload_file(file_path, index):
                    try:
                        with open(file_path, "rb") as f:
                            response = client.post(
                                "/api/episodes/upload",
                                files={"file": (f"test_audio_{index}.mp3", f, "audio/mpeg")},
                                data={"title": f"Episode {index}"}
                            )
                            results.append((index, response.status_code))
                    except Exception as e:
                        errors.append((index, str(e)))
                
                threads = []
                for i, (file_path, _) in enumerate(files):
                    thread = threading.Thread(target=upload_file, args=(file_path, i))
                    threads.append(thread)
                    thread.start()
                
                # 等待所有线程完成
                for thread in threads:
                    thread.join(timeout=30.0)
                
                # 验证所有上传都成功（无死锁）
                assert len(errors) == 0, f"上传过程中出现错误: {errors}"
                assert len(results) == 3, f"应该有 3 个结果，实际: {len(results)}"
                
                # 验证所有响应都是 200
                for index, status_code in results:
                    assert status_code == 200, f"文件 {index} 上传失败，状态码: {status_code}"


@pytest.mark.unit
class TestEpisodeCRUD:
    """测试 Episode CRUD 操作"""
    
    def test_create_episode(self, client, db_session, tmp_path):
        """测试创建 Episode：验证数据库记录"""
        audio_file = tmp_path / "test_audio.mp3"
        audio_content = b"fake audio data"
        audio_file.write_bytes(audio_content)
        file_hash = hashlib.md5(audio_content).hexdigest()
        
        # Mock 音频时长获取（mock app.api 中的导入，因为 api.py 直接导入了函数）
        with patch('app.api.get_audio_duration', return_value=180.0):
            # Mock 存储路径（使用临时目录）
            with patch('app.config.AUDIO_STORAGE_PATH', str(tmp_path / "audios")):
                with open(audio_file, "rb") as f:
                    response = client.post(
                        "/api/episodes/upload",
                        files={"file": ("test_audio.mp3", f, "audio/mpeg")},
                        data={"title": "Test Episode"}
                    )
                
                assert response.status_code == 200
                data = response.json()
                episode_id = data["episode_id"]
                
                # 验证数据库记录
                episode = db_session.query(Episode).filter(Episode.id == episode_id).first()
                assert episode is not None
                assert episode.title == "Test Episode"
                assert episode.file_hash == file_hash
                assert episode.duration == 180.0
                assert episode.transcription_status in ["pending", "processing"]
    
    def test_trigger_transcription(self, client, db_session, tmp_path):
        """测试触发 Whisper 转录：验证状态变更"""
        # 创建 Episode
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_001",
            duration=180.0,
            audio_path=str(tmp_path / "test.mp3"),
            transcription_status="pending"
        )
        db_session.add(episode)
        db_session.commit()
        
        # Mock 转录任务（不实际执行）
        with patch('app.main.run_transcription_task') as mock_task:
            # 触发转录
            response = client.post(f"/api/episodes/{episode.id}/transcribe")
            
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "processing"
            
            # 验证后台任务被添加
            # 注意：TestClient 不会实际执行 BackgroundTasks，所以这里只验证接口返回正确
    
    def test_get_episodes_list(self, client, db_session):
        """测试查询 Episode 列表：分页和过滤"""
        # 创建多个 Episode
        for i in range(5):
            episode = Episode(
                title=f"Episode {i}",
                file_hash=f"hash_{i}",
                duration=180.0 + i * 10,
                transcription_status="completed" if i % 2 == 0 else "pending"
            )
            db_session.add(episode)
        db_session.commit()
        
        # 测试分页
        response = client.get("/api/episodes?page=1&limit=2")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert "page" in data
        assert "pages" in data
        assert len(data["items"]) == 2
        assert data["total"] == 5
        assert data["page"] == 1
        
        # 测试状态过滤
        response = client.get("/api/episodes?status=completed")
        assert response.status_code == 200
        data = response.json()
        assert all(item["transcription_status"] == "completed" for item in data["items"])
    
    def test_get_episode_detail(self, client, db_session):
        """测试查询单个 Episode 详情：包含 TranscriptCue"""
        # 创建 Episode 和 TranscriptCue
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_002",
            duration=180.0
        )
        db_session.add(episode)
        db_session.flush()
        
        # 创建 TranscriptCue
        cue1 = TranscriptCue(
            episode_id=episode.id,
            start_time=0.0,
            end_time=5.0,
            speaker="Speaker 1",
            text="First sentence"
        )
        cue2 = TranscriptCue(
            episode_id=episode.id,
            start_time=5.0,
            end_time=10.0,
            speaker="Speaker 2",
            text="Second sentence"
        )
        db_session.add_all([cue1, cue2])
        db_session.commit()
        
        # 查询详情
        response = client.get(f"/api/episodes/{episode.id}")
        assert response.status_code == 200
        data = response.json()
        
        assert data["id"] == episode.id
        assert data["title"] == "Test Episode"
        assert "cues" in data
        assert len(data["cues"]) == 2
        assert data["cues"][0]["text"] == "First sentence"
        assert data["cues"][1]["text"] == "Second sentence"
    
    def test_get_episode_status(self, client, db_session):
        """测试获取转录进度：轮询接口"""
        # 创建 Episode
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_003",
            duration=180.0,
            transcription_status="processing"
        )
        db_session.add(episode)
        db_session.commit()
        
        # 查询状态
        response = client.get(f"/api/episodes/{episode.id}/status")
        assert response.status_code == 200
        data = response.json()
        
        assert "status" in data
        assert "progress" in data
        assert "completed_segments" in data
        assert "total_segments" in data
        assert data["status"] == "processing"
    
    def test_get_episode_segments(self, client, db_session):
        """测试获取虚拟分段信息：用于调试"""
        # 创建 Episode
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_004",
            duration=600.0  # 长音频，需要分段
        )
        db_session.add(episode)
        db_session.commit()
        
        # 查询分段信息
        response = client.get(f"/api/episodes/{episode.id}/segments")
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        # 如果已创建分段，验证结构
        if len(data) > 0:
            assert "segment_id" in data[0]
            assert "status" in data[0]
            assert "cue_count" in data[0]

