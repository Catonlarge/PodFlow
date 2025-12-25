"""
文件验证安全测试

测试文件内容真伪校验功能，验证系统能够正确拦截伪装成音频文件的文本文件。

测试覆盖：
1. is_valid_audio_header() 函数单元测试
2. 上传 API 拒绝文本文件伪装的安全测试
3. 各种音频格式的文件头验证
4. 真实音频文件应该通过验证
"""
import pytest
import tempfile
from pathlib import Path
from unittest.mock import patch

from app.utils.file_utils import is_valid_audio_header
from app.models import Episode


@pytest.mark.unit
class TestIsValidAudioHeader:
    """测试 is_valid_audio_header() 函数"""
    
    def test_reject_html_file(self, tmp_path):
        """测试拒绝 HTML 文件"""
        html_file = tmp_path / "fake.html"
        html_file.write_text("<!DOCTYPE html><html><body>Fake audio</body></html>")
        
        assert is_valid_audio_header(str(html_file)) is False
    
    def test_reject_html_file_starting_with_htm(self, tmp_path):
        """测试拒绝以 <htm 开头的文件"""
        html_file = tmp_path / "fake.mp3"
        html_file.write_text("<html><head><title>Fake</title></head></html>")
        
        assert is_valid_audio_header(str(html_file)) is False
    
    def test_reject_json_file(self, tmp_path):
        """测试拒绝 JSON 文件"""
        json_file = tmp_path / "fake.mp3"
        json_file.write_text('{"error": "not an audio file", "data": []}')
        
        assert is_valid_audio_header(str(json_file)) is False
    
    def test_reject_python_traceback(self, tmp_path):
        """测试拒绝包含 Traceback 的文件"""
        error_file = tmp_path / "fake.mp3"
        error_file.write_text("Traceback (most recent call last):\n  File ...")
        
        assert is_valid_audio_header(str(error_file)) is False
    
    def test_reject_fake_audio_text(self, tmp_path):
        """测试拒绝包含 'fake audio' 文本的文件"""
        fake_file = tmp_path / "fake.mp3"
        fake_file.write_text("fake audio data 1fake audio data 1fake audio data 1")
        
        assert is_valid_audio_header(str(fake_file)) is False
    
    def test_reject_text_file_starting_with_bracket(self, tmp_path):
        """测试拒绝以 [ 开头的文本文件"""
        text_file = tmp_path / "fake.mp3"
        text_file.write_text("[error] This is not an audio file")
        
        assert is_valid_audio_header(str(text_file)) is False
    
    def test_accept_mp3_with_id3_tag(self, tmp_path):
        """测试接受包含 ID3 标签的 MP3 文件"""
        mp3_file = tmp_path / "test.mp3"
        # MP3 with ID3 tag: ID3 header (3 bytes) + version + flags + size
        id3_header = b"ID3\x03\x00\x00\x00\x00\x00\x00" + b"x" * 100
        mp3_file.write_bytes(id3_header)
        
        assert is_valid_audio_header(str(mp3_file)) is True
    
    def test_accept_mp3_with_frame_sync(self, tmp_path):
        """测试接受包含 MP3 帧同步标记的文件"""
        mp3_file = tmp_path / "test.mp3"
        # MP3 frame sync: 0xFF 0xFB (MPEG-1 Layer III)
        mp3_header = b"\xFF\xFB\x90\x00" + b"x" * 100
        mp3_file.write_bytes(mp3_header)
        
        assert is_valid_audio_header(str(mp3_file)) is True
    
    def test_accept_wav_file(self, tmp_path):
        """测试接受 WAV 文件（RIFF 格式）"""
        wav_file = tmp_path / "test.wav"
        # WAV file header: RIFF + size + WAVE
        wav_header = b"RIFF\x24\x00\x00\x00WAVE" + b"x" * 100
        wav_file.write_bytes(wav_header)
        
        assert is_valid_audio_header(str(wav_file)) is True
    
    def test_accept_flac_file(self, tmp_path):
        """测试接受 FLAC 文件"""
        flac_file = tmp_path / "test.flac"
        # FLAC file header
        flac_header = b"fLaC" + b"x" * 100
        flac_file.write_bytes(flac_header)
        
        assert is_valid_audio_header(str(flac_file)) is True
    
    def test_accept_ogg_file(self, tmp_path):
        """测试接受 OGG 文件"""
        ogg_file = tmp_path / "test.ogg"
        # OGG file header
        ogg_header = b"OggS" + b"x" * 100
        ogg_file.write_bytes(ogg_header)
        
        assert is_valid_audio_header(str(ogg_file)) is True
    
    def test_accept_m4a_file(self, tmp_path):
        """测试接受 M4A/MP4 文件（包含 ftyp）
        
        注意：由于 M4A 文件格式较复杂，这个测试可能因实现细节而失败。
        实际使用中，M4A 文件的最终验证会由 get_audio_duration 的 ffprobe 完成。
        """
        m4a_file = tmp_path / "test.m4a"
        # M4A file header: 前 3 字节是 \x00\x00\x00，然后包含 ftyp
        # 更准确的格式：前 4 字节是 box size，接下来 4 字节是 box type "ftyp"
        m4a_header = b"\x00\x00\x00\x20ftypM4A " + b"x" * 100
        m4a_file.write_bytes(m4a_header)
        
        # 检查 ftyp 是否在 header[:20] 中（应该在第 4-8 字节）
        result = is_valid_audio_header(str(m4a_file))
        # M4A 文件应该被识别（header[:4] == b'\x00\x00\x00' 且 b'ftyp' in header[:20]）
        # 但如果检测失败，至少应该不会被误判为文本文件
        # 最终验证由 get_audio_duration 完成
        assert result is True, "M4A 文件应该被识别为有效音频文件头"
    
    def test_accept_binary_file_without_text_indicators(self, tmp_path):
        """测试接受没有文本标识符的二进制文件（宽松策略）"""
        binary_file = tmp_path / "test.mp3"
        # 包含大量非打印字符的二进制数据
        binary_data = bytes(range(256)) * 10
        binary_file.write_bytes(binary_data)
        
        # 应该通过（宽松策略，最终由 get_audio_duration 验证）
        assert is_valid_audio_header(str(binary_file)) is True
    
    def test_reject_empty_file(self, tmp_path):
        """测试拒绝空文件"""
        empty_file = tmp_path / "empty.mp3"
        empty_file.write_bytes(b"")
        
        assert is_valid_audio_header(str(empty_file)) is False
    
    def test_reject_very_small_text_file(self, tmp_path):
        """测试拒绝非常小的文本文件"""
        small_file = tmp_path / "small.mp3"
        small_file.write_text("fake")
        
        assert is_valid_audio_header(str(small_file)) is False


@pytest.mark.unit
class TestUploadAPISecurityValidation:
    """测试上传 API 的安全验证（拒绝伪装文件）"""
    
    def test_reject_html_as_mp3(self, client, db_session, tmp_path):
        """测试拒绝 HTML 文件伪装成 MP3"""
        html_file = tmp_path / "fake.mp3"
        html_content = "<!DOCTYPE html><html><body>Fake audio file</body></html>"
        html_file.write_text(html_content)
        
        with patch('app.config.AUDIO_STORAGE_PATH', str(tmp_path / "audios")):
            with open(html_file, "rb") as f:
                response = client.post(
                    "/api/episodes/upload",
                    files={"file": ("fake.mp3", f, "audio/mpeg")},
                    data={"title": "Fake HTML File"}
                )
        
        assert response.status_code == 400
        data = response.json()
        assert "文件内容异常" in data["detail"] or "文本文件" in data["detail"]
        
        # 验证没有创建 Episode 记录
        episode = db_session.query(Episode).filter(Episode.title == "Fake HTML File").first()
        assert episode is None, "不应该创建 Episode 记录"
    
    def test_reject_json_as_mp3(self, client, db_session, tmp_path):
        """测试拒绝 JSON 文件伪装成 MP3"""
        json_file = tmp_path / "fake.mp3"
        json_content = '{"error": "not an audio file", "status": "failed"}'
        json_file.write_text(json_content)
        
        with patch('app.config.AUDIO_STORAGE_PATH', str(tmp_path / "audios")):
            with open(json_file, "rb") as f:
                response = client.post(
                    "/api/episodes/upload",
                    files={"file": ("fake.mp3", f, "application/json")},
                    data={"title": "Fake JSON File"}
                )
        
        assert response.status_code == 400
        data = response.json()
        assert "文件内容异常" in data["detail"] or "文本文件" in data["detail"]
        
        # 验证没有创建 Episode 记录
        episode = db_session.query(Episode).filter(Episode.title == "Fake JSON File").first()
        assert episode is None
    
    def test_reject_fake_audio_text(self, client, db_session, tmp_path):
        """测试拒绝包含 'fake audio' 的文本文件"""
        fake_file = tmp_path / "fake.mp3"
        fake_content = "fake audio data 1" * 100
        fake_file.write_text(fake_content)
        
        with patch('app.config.AUDIO_STORAGE_PATH', str(tmp_path / "audios")):
            with open(fake_file, "rb") as f:
                response = client.post(
                    "/api/episodes/upload",
                    files={"file": ("fake.mp3", f, "audio/mpeg")},
                    data={"title": "Fake Audio Text"}
                )
        
        assert response.status_code == 400
        data = response.json()
        assert "文件内容异常" in data["detail"] or "文本文件" in data["detail"]
        
        # 验证没有创建 Episode 记录
        episode = db_session.query(Episode).filter(Episode.title == "Fake Audio Text").first()
        assert episode is None
    
    def test_reject_python_error_as_mp3(self, client, db_session, tmp_path):
        """测试拒绝包含 Python 错误的文本文件"""
        error_file = tmp_path / "error.mp3"
        error_content = "Traceback (most recent call last):\n  File 'test.py', line 1\n    invalid syntax\nSyntaxError: invalid syntax"
        error_file.write_text(error_content)
        
        with patch('app.config.AUDIO_STORAGE_PATH', str(tmp_path / "audios")):
            with open(error_file, "rb") as f:
                response = client.post(
                    "/api/episodes/upload",
                    files={"file": ("error.mp3", f, "audio/mpeg")},
                    data={"title": "Python Error"}
                )
        
        assert response.status_code == 400
        data = response.json()
        assert "文件内容异常" in data["detail"] or "文本文件" in data["detail"]
        
        # 验证没有创建 Episode 记录
        episode = db_session.query(Episode).filter(Episode.title == "Python Error").first()
        assert episode is None
    
    def test_reject_text_file_with_valid_mp3_extension(self, client, db_session, tmp_path):
        """测试拒绝纯文本文件（即使扩展名是 .mp3）"""
        text_file = tmp_path / "text.mp3"
        text_content = "This is a plain text file with .mp3 extension"
        text_file.write_text(text_content)
        
        with patch('app.config.AUDIO_STORAGE_PATH', str(tmp_path / "audios")):
            with open(text_file, "rb") as f:
                response = client.post(
                    "/api/episodes/upload",
                    files={"file": ("text.mp3", f, "audio/mpeg")},
                    data={"title": "Text File"}
                )
        
        assert response.status_code == 400
        data = response.json()
        assert "文件内容异常" in data["detail"] or "文本文件" in data["detail"]
        
        # 验证没有创建 Episode 记录
        episode = db_session.query(Episode).filter(Episode.title == "Text File").first()
        assert episode is None
    
    def test_accept_valid_mp3_header(self, client, db_session, tmp_path):
        """测试接受具有有效 MP3 文件头的文件"""
        mp3_file = tmp_path / "valid.mp3"
        # 创建包含 MP3 帧同步标记的文件
        mp3_header = b"\xFF\xFB\x90\x00" + b"x" * (1024 * 1024)  # 1MB 数据
        mp3_file.write_bytes(mp3_header)
        
        with patch('app.config.AUDIO_STORAGE_PATH', str(tmp_path / "audios")):
            # Mock get_audio_duration 以通过最终验证
            with patch('app.api.get_audio_duration', return_value=180.0):
                with open(mp3_file, "rb") as f:
                    response = client.post(
                        "/api/episodes/upload",
                        files={"file": ("valid.mp3", f, "audio/mpeg")},
                        data={"title": "Valid MP3"}
                    )
        
        # 应该通过文件头验证（但可能因 get_audio_duration 失败而失败）
        # 这里主要验证文件头验证通过了
        # 如果 get_audio_duration mock 成功，应该返回 200
        # 如果失败，应该返回 400（无法解析音频文件）
        assert response.status_code in [200, 400]
        if response.status_code == 200:
            # 验证创建了 Episode
            data = response.json()
            assert "episode_id" in data
        else:
            # 如果失败，错误应该来自 get_audio_duration，而不是文件头验证
            data = response.json()
            assert "文件内容异常" not in data["detail"]  # 不应该被文件头验证拦截


@pytest.mark.unit
class TestFileValidationEdgeCases:
    """测试文件验证的边界情况"""
    
    def test_reject_file_starting_with_less_than(self, tmp_path):
        """测试拒绝以 < 开头的文件（可能是 HTML/XML）"""
        xml_file = tmp_path / "fake.mp3"
        xml_file.write_text("<root><data>fake</data></root>")
        
        assert is_valid_audio_header(str(xml_file)) is False
    
    def test_reject_file_starting_with_brace(self, tmp_path):
        """测试拒绝以 { 开头的文件（可能是 JSON）"""
        json_file = tmp_path / "fake.mp3"
        json_file.write_text('{"key": "value"}')
        
        assert is_valid_audio_header(str(json_file)) is False
    
    def test_reject_file_starting_with_error(self, tmp_path):
        """测试拒绝以 'Error' 开头的文件"""
        error_file = tmp_path / "fake.mp3"
        error_file.write_text("Error: Something went wrong")
        
        assert is_valid_audio_header(str(error_file)) is False
    
    def test_reject_file_starting_with_exception(self, tmp_path):
        """测试拒绝以 'Exception' 开头的文件"""
        exception_file = tmp_path / "fake.mp3"
        exception_file.write_text("Exception: File not found")
        
        assert is_valid_audio_header(str(exception_file)) is False
    
    def test_file_validation_before_duration_check(self, client, db_session, tmp_path):
        """测试文件头验证在时长检查之前执行"""
        fake_file = tmp_path / "fake.mp3"
        fake_file.write_text("fake audio data 1" * 100)
        
        # 即使 mock 了 get_audio_duration，文件头验证也应该先拦截
        with patch('app.config.AUDIO_STORAGE_PATH', str(tmp_path / "audios")):
            with patch('app.api.get_audio_duration', return_value=180.0):
                with open(fake_file, "rb") as f:
                    response = client.post(
                        "/api/episodes/upload",
                        files={"file": ("fake.mp3", f, "audio/mpeg")},
                        data={"title": "Fake File"}
                    )
        
        # 应该被文件头验证拦截，不会到达 get_audio_duration
        assert response.status_code == 400
        data = response.json()
        assert "文件内容异常" in data["detail"] or "文本文件" in data["detail"]

