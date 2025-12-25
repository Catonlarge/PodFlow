"""
Episode 管理 API 集成测试

使用真实音频文件进行端到端测试，验证完整流程。
这些测试运行较慢，但能验证实际的文件处理、MD5 计算和音频时长获取。
"""
import pytest
import time
import hashlib
import threading
from pathlib import Path
from unittest.mock import patch

from app.models import Episode


@pytest.mark.integration
class TestFileUploadIntegration:
    """文件上传集成测试（使用真实文件）"""
    
    def test_upload_real_audio_file(self, client, db_session, real_audio_file):
        """测试上传真实音频文件：完整流程"""
        audio_path = Path(real_audio_file)
        
        with open(audio_path, "rb") as f:
            response = client.post(
                "/api/episodes/upload",
                files={"file": (audio_path.name, f, "audio/mpeg")},
                data={"title": "Figma CEO - Why AI makes design"}
            )
        
        # 验证响应
        assert response.status_code == 200, f"上传失败: {response.text}"
        data = response.json()
        assert "episode_id" in data
        assert data["status"] in ["processing", "pending"]
        assert "is_duplicate" in data
        
        # 验证数据库记录
        episode = db_session.query(Episode).filter(Episode.id == data["episode_id"]).first()
        assert episode is not None, "Episode 未创建"
        assert episode.title == "Figma CEO - Why AI makes design"
        assert episode.file_hash is not None, "file_hash 未设置"
        assert episode.duration > 0, f"音频时长无效: {episode.duration}"
        assert episode.file_size > 0, f"文件大小无效: {episode.file_size}"
        assert episode.audio_path is not None, "audio_path 未设置"


@pytest.mark.integration
class TestFileDeduplicationIntegration:
    """文件去重集成测试（使用真实文件）"""
    
    def test_upload_duplicate_real_file(self, client, db_session, real_audio_file):
        """测试上传真实文件两次：验证去重逻辑"""
        audio_path = Path(real_audio_file)
        
        # 读取文件内容用于计算 MD5
        with open(audio_path, "rb") as f:
            file_content = f.read()
        expected_hash = hashlib.md5(file_content).hexdigest()
        
        # 第一次上传
        with open(audio_path, "rb") as f:
            response1 = client.post(
                "/api/episodes/upload",
                files={"file": (audio_path.name, f, "audio/mpeg")},
                data={"title": "First Upload"}
            )
        
        assert response1.status_code == 200, f"第一次上传失败: {response1.text}"
        data1 = response1.json()
        episode_id_1 = data1["episode_id"]
        assert data1["is_duplicate"] is False, "第一次上传应该标记为非重复"
        
        # 验证第一次上传的 Episode
        episode1 = db_session.query(Episode).filter(Episode.id == episode_id_1).first()
        assert episode1 is not None
        assert episode1.file_hash == expected_hash, "file_hash 不匹配"
        
        # 第二次上传相同文件
        with open(audio_path, "rb") as f:
            response2 = client.post(
                "/api/episodes/upload",
                files={"file": (audio_path.name, f, "audio/mpeg")},
                data={"title": "Second Upload"}
            )
        
        assert response2.status_code == 200, f"第二次上传失败: {response2.text}"
        data2 = response2.json()
        assert data2["is_duplicate"] is True, "第二次上传应该标记为重复"
        assert data2["episode_id"] == episode_id_1, "应该返回已存在的 Episode ID"
        
        # 验证数据库中只有一个 Episode（相同 file_hash）
        episodes = db_session.query(Episode).filter(Episode.file_hash == expected_hash).all()
        assert len(episodes) == 1, f"应该有且仅有一个 Episode，实际: {len(episodes)}"
        
        # 验证第二次上传没有创建新记录
        all_episodes = db_session.query(Episode).all()
        assert len(all_episodes) == 1, f"应该只有一个 Episode，实际: {len(all_episodes)}"


@pytest.mark.integration
class TestAsyncMD5CalculationIntegration:
    """异步 MD5 计算集成测试（使用真实文件）"""
    
    def test_md5_calculation_non_blocking_with_real_file(self, client, db_session, real_audio_file):
        """测试真实文件 MD5 计算期间，其他 API 请求仍能正常响应"""
        audio_path = Path(real_audio_file)
        
        # 启动上传任务（在后台线程中执行，模拟异步）
        upload_started = threading.Event()
        upload_completed = threading.Event()
        upload_response = None
        upload_error = None
        
        def upload_file():
            nonlocal upload_response, upload_error
            try:
                upload_started.set()
                with open(audio_path, "rb") as f:
                    upload_response = client.post(
                        "/api/episodes/upload",
                        files={"file": (audio_path.name, f, "audio/mpeg")},
                        data={"title": "Large File Test"}
                    )
            except Exception as e:
                upload_error = e
            finally:
                upload_completed.set()
        
        upload_thread = threading.Thread(target=upload_file)
        upload_thread.start()
        
        # 等待上传开始（确保 MD5 计算已开始）
        assert upload_started.wait(timeout=2.0), "上传任务未启动"
        
        # 在上传进行中，发送多个其他 API 请求
        response_times = []
        for i in range(5):
            start_time = time.time()
            response = client.get("/api/episodes")
            end_time = time.time()
            
            response_time = (end_time - start_time) * 1000  # 转换为毫秒
            response_times.append(response_time)
            
            # 验证其他请求能正常响应
            assert response.status_code == 200, f"第 {i+1} 次请求失败"
        
        # 等待上传完成
        assert upload_completed.wait(timeout=30.0), "上传任务超时"
        upload_thread.join()
        
        # 验证没有错误
        assert upload_error is None, f"上传过程中出现错误: {upload_error}"
        
        # 验证上传成功
        assert upload_response is not None, "上传响应为空"
        assert upload_response.status_code == 200, f"上传失败: {upload_response.text}"
        
        # 验证其他请求的响应时间 < 100ms（不被 MD5 计算阻塞）
        max_response_time = max(response_times)
        avg_response_time = sum(response_times) / len(response_times)
        
        assert max_response_time < 100, \
            f"最大响应时间 {max_response_time}ms 超过 100ms，可能被阻塞。所有响应时间: {response_times}"
        
        # 记录性能信息（用于调试）
        print(f"\n[性能测试] 平均响应时间: {avg_response_time:.2f}ms, 最大响应时间: {max_response_time:.2f}ms")
    
    def test_concurrent_uploads_with_real_file(self, client, db_session, real_audio_file):
        """测试并发上传真实文件：所有文件都能正常计算 MD5（无死锁）"""
        audio_path = Path(real_audio_file)
        
        # 并发上传 3 次（使用相同文件，但不同标题）
        results = []
        errors = []
        
        def upload_file(index):
            try:
                with open(audio_path, "rb") as f:
                    response = client.post(
                        "/api/episodes/upload",
                        files={"file": (f"test_audio_{index}.mp3", f, "audio/mpeg")},
                        data={"title": f"Episode {index}"}
                    )
                    results.append((index, response.status_code, response.json() if response.status_code == 200 else None))
            except Exception as e:
                errors.append((index, str(e)))
        
        threads = []
        for i in range(3):
            thread = threading.Thread(target=upload_file, args=(i,))
            threads.append(thread)
            thread.start()
        
        # 等待所有线程完成
        for thread in threads:
            thread.join(timeout=30.0)
        
        # 验证所有上传都成功（无死锁）
        assert len(errors) == 0, f"上传过程中出现错误: {errors}"
        assert len(results) == 3, f"应该有 3 个结果，实际: {len(results)}"
        
        # 验证所有响应都是 200
        for index, status_code, data in results:
            assert status_code == 200, f"文件 {index} 上传失败，状态码: {status_code}"
            assert data is not None, f"文件 {index} 响应数据为空"
            assert "episode_id" in data, f"文件 {index} 响应缺少 episode_id"
        
        # 验证去重逻辑：后两次上传应该被识别为重复
        episode_ids = [data["episode_id"] for _, _, data in results]
        assert len(set(episode_ids)) == 1, \
            f"所有上传应该返回相同的 Episode ID（去重），实际: {episode_ids}"

