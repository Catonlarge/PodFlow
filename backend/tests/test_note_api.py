# -*- coding: utf-8 -*-
"""
Note API 单元测试

测试覆盖：
1. 创建笔记（三种类型：underline/thought/ai_card）
2. 更新笔记内容
3. 删除笔记（级联删除验证）
4. 获取笔记列表（按 episode_id 查询）
5. 反向关联验证（删除 Note 不影响 AIQueryRecord）
"""
import pytest
from datetime import datetime
from fastapi.testclient import TestClient

from app.models import Episode, TranscriptCue, Highlight, Note, AIQueryRecord


@pytest.mark.unit
class TestNoteAPI:
    """Note API 单元测试"""
    
    def test_create_note_underline(self, client, db_session):
        """测试创建 underline 类型笔记"""
        # Arrange: 创建 Episode、TranscriptCue 和 Highlight
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_001",
            duration=180.0,
            transcription_status="completed"
        )
        db_session.add(episode)
        db_session.commit()
        db_session.refresh(episode)
        
        cue = TranscriptCue(
            episode_id=episode.id,
            start_time=0.0,
            end_time=5.0,
            speaker="Speaker1",
            text="Hello world."
        )
        db_session.add(cue)
        db_session.commit()
        db_session.refresh(cue)
        
        highlight = Highlight(
            episode_id=episode.id,
            cue_id=cue.id,
            start_offset=0,
            end_offset=5,
            highlighted_text="Hello",
            color="#9C27B0"
        )
        db_session.add(highlight)
        db_session.commit()
        db_session.refresh(highlight)
        
        # Act: POST /api/notes (note_type = "underline")
        response = client.post(
            "/api/notes",
            json={
                "episode_id": episode.id,
                "highlight_id": highlight.id,
                "content": None,  # underline 类型时为空
                "note_type": "underline",
                "origin_ai_query_id": None
            }
        )
        
        # Assert
        assert response.status_code == 201  # 创建操作返回 201
        data = response.json()
        assert "id" in data
        assert "created_at" in data
        
        # 验证数据库中的记录
        note = db_session.query(Note).filter_by(id=data["id"]).first()
        assert note is not None
        assert note.episode_id == episode.id
        assert note.highlight_id == highlight.id
        assert note.note_type == "underline"
        assert note.content is None
        assert note.origin_ai_query_id is None
    
    def test_create_note_thought(self, client, db_session):
        """测试创建 thought 类型笔记"""
        # Arrange
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_002",
            duration=180.0,
            transcription_status="completed"
        )
        db_session.add(episode)
        db_session.commit()
        db_session.refresh(episode)
        
        cue = TranscriptCue(
            episode_id=episode.id,
            start_time=0.0,
            end_time=5.0,
            speaker="Speaker1",
            text="Hello world."
        )
        db_session.add(cue)
        db_session.commit()
        db_session.refresh(cue)
        
        highlight = Highlight(
            episode_id=episode.id,
            cue_id=cue.id,
            start_offset=0,
            end_offset=5,
            highlighted_text="Hello",
            color="#9C27B0"
        )
        db_session.add(highlight)
        db_session.commit()
        db_session.refresh(highlight)
        
        # Act: POST /api/notes (note_type = "thought")
        response = client.post(
            "/api/notes",
            json={
                "episode_id": episode.id,
                "highlight_id": highlight.id,
                "content": "This is my thought about this text.",
                "note_type": "thought",
                "origin_ai_query_id": None
            }
        )
        
        # Assert
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        
        # 验证数据库中的记录
        note = db_session.query(Note).filter_by(id=data["id"]).first()
        assert note is not None
        assert note.note_type == "thought"
        assert note.content == "This is my thought about this text."
    
    def test_create_note_ai_card(self, client, db_session):
        """测试创建 ai_card 类型笔记（带 origin_ai_query_id）"""
        # Arrange
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_003",
            duration=180.0,
            transcription_status="completed"
        )
        db_session.add(episode)
        db_session.commit()
        db_session.refresh(episode)
        
        cue = TranscriptCue(
            episode_id=episode.id,
            start_time=0.0,
            end_time=5.0,
            speaker="Speaker1",
            text="Hello world."
        )
        db_session.add(cue)
        db_session.commit()
        db_session.refresh(cue)
        
        highlight = Highlight(
            episode_id=episode.id,
            cue_id=cue.id,
            start_offset=0,
            end_offset=5,
            highlighted_text="Hello",
            color="#9C27B0"
        )
        db_session.add(highlight)
        db_session.commit()
        db_session.refresh(highlight)
        
        import json
        response_json = {"type": "word", "content": {"definition": "问候", "explanation": "A greeting."}}
        ai_query = AIQueryRecord(
            highlight_id=highlight.id,
            query_text="Hello",
            context_text="Hello world.",
            response_text=json.dumps(response_json),
            detected_type="word",
            provider="gemini-2.5-flash",
            status="completed"
        )
        db_session.add(ai_query)
        db_session.commit()
        db_session.refresh(ai_query)
        
        # Act: POST /api/notes (note_type = "ai_card", origin_ai_query_id 提供)
        # Note 的 content 格式化为可读文本（从 JSON 提取）
        parsed_response = json.loads(ai_query.response_text)
        note_content = f"{parsed_response['content']['definition']}\n{parsed_response['content']['explanation']}"
        
        response = client.post(
            "/api/notes",
            json={
                "episode_id": episode.id,
                "highlight_id": highlight.id,
                "content": note_content,  # ⭐ 格式化的文本内容
                "note_type": "ai_card",
                "origin_ai_query_id": ai_query.id
            }
        )
        
        # Assert
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        
        # 验证数据库中的记录
        note = db_session.query(Note).filter_by(id=data["id"]).first()
        assert note is not None
        assert note.note_type == "ai_card"
        assert note.content == note_content  # ⭐ 格式化的文本内容
        assert note.origin_ai_query_id == ai_query.id
    
    def test_create_note_with_invalid_highlight(self, client, db_session):
        """测试无效 highlight_id"""
        # Arrange
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_004",
            duration=180.0,
            transcription_status="completed"
        )
        db_session.add(episode)
        db_session.commit()
        db_session.refresh(episode)
        
        # Act: POST /api/notes (highlight_id 不存在)
        response = client.post(
            "/api/notes",
            json={
                "episode_id": episode.id,
                "highlight_id": 99999,  # 不存在的 highlight_id
                "content": "Test content",
                "note_type": "thought",
                "origin_ai_query_id": None
            }
        )
        
        # Assert
        assert response.status_code == 404
        assert "highlight" in response.json()["detail"].lower()
    
    def test_create_note_underline_with_content_fails(self, client, db_session):
        """测试创建 underline 类型笔记时不能有 content"""
        # Arrange: 创建 Episode、TranscriptCue 和 Highlight
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_006_underline_content",
            duration=180.0,
            transcription_status="completed"
        )
        db_session.add(episode)
        db_session.commit()
        db_session.refresh(episode)
        
        cue = TranscriptCue(
            episode_id=episode.id,
            start_time=0.0,
            end_time=5.0,
            speaker="Speaker1",
            text="Hello world."
        )
        db_session.add(cue)
        db_session.commit()
        db_session.refresh(cue)
        
        highlight = Highlight(
            episode_id=episode.id,
            cue_id=cue.id,
            start_offset=0,
            end_offset=5,
            highlighted_text="Hello",
            color="#9C27B0"
        )
        db_session.add(highlight)
        db_session.commit()
        db_session.refresh(highlight)
        
        # Act: POST /api/notes (note_type = "underline", content 不为空)
        response = client.post(
            "/api/notes",
            json={
                "episode_id": episode.id,
                "highlight_id": highlight.id,
                "content": "This should not be allowed",  # ⚠️ underline 类型不能有 content
                "note_type": "underline",
                "origin_ai_query_id": None
            }
        )
        
        # Assert: 应该返回 400 错误
        assert response.status_code == 400
        assert "underline" in response.json()["detail"].lower()
        assert "content" in response.json()["detail"].lower()
    
    def test_create_note_with_invalid_episode(self, client, db_session):
        """测试 highlight_id 不属于该 episode_id"""
        # Arrange: 创建两个 Episode
        episode1 = Episode(
            title="Episode 1",
            file_hash="test_hash_005",
            duration=180.0,
            transcription_status="completed"
        )
        episode2 = Episode(
            title="Episode 2",
            file_hash="test_hash_006",
            duration=180.0,
            transcription_status="completed"
        )
        db_session.add_all([episode1, episode2])
        db_session.commit()
        db_session.refresh(episode1)
        db_session.refresh(episode2)
        
        cue = TranscriptCue(
            episode_id=episode1.id,
            start_time=0.0,
            end_time=5.0,
            speaker="Speaker1",
            text="Hello world."
        )
        db_session.add(cue)
        db_session.commit()
        db_session.refresh(cue)
        
        highlight = Highlight(
            episode_id=episode1.id,
            cue_id=cue.id,
            start_offset=0,
            end_offset=5,
            highlighted_text="Hello",
            color="#9C27B0"
        )
        db_session.add(highlight)
        db_session.commit()
        db_session.refresh(highlight)
        
        # Act: POST /api/notes (episode_id 与 highlight.episode_id 不匹配)
        response = client.post(
            "/api/notes",
            json={
                "episode_id": episode2.id,  # 错误的 episode_id
                "highlight_id": highlight.id,  # 属于 episode1
                "content": "Test content",
                "note_type": "thought",
                "origin_ai_query_id": None
            }
        )
        
        # Assert
        assert response.status_code == 400
        assert "episode" in response.json()["detail"].lower() or "highlight" in response.json()["detail"].lower()
    
    def test_update_note_content(self, client, db_session):
        """测试更新笔记内容"""
        # Arrange: 创建 Episode、Highlight 和 Note
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_007",
            duration=180.0,
            transcription_status="completed"
        )
        db_session.add(episode)
        db_session.commit()
        db_session.refresh(episode)
        
        cue = TranscriptCue(
            episode_id=episode.id,
            start_time=0.0,
            end_time=5.0,
            speaker="Speaker1",
            text="Hello world."
        )
        db_session.add(cue)
        db_session.commit()
        db_session.refresh(cue)
        
        highlight = Highlight(
            episode_id=episode.id,
            cue_id=cue.id,
            start_offset=0,
            end_offset=5,
            highlighted_text="Hello",
            color="#9C27B0"
        )
        db_session.add(highlight)
        db_session.commit()
        db_session.refresh(highlight)
        
        note = Note(
            episode_id=episode.id,
            highlight_id=highlight.id,
            content="Original content",
            note_type="thought"
        )
        db_session.add(note)
        db_session.commit()
        db_session.refresh(note)
        
        original_updated_at = note.updated_at
        
        # Act: PUT /api/notes/{id}
        response = client.put(
            f"/api/notes/{note.id}",
            json={
                "content": "Updated content"
            }
        )
        
        # Assert
        assert response.status_code == 200  # 更新操作返回 200
        data = response.json()
        assert data["success"] is True
        
        # 验证数据库中的记录已更新
        db_session.refresh(note)
        assert note.content == "Updated content"
        assert note.updated_at > original_updated_at
    
    def test_update_note_not_found(self, client, db_session):
        """测试更新不存在的笔记"""
        # Act: PUT /api/notes/99999
        response = client.put(
            "/api/notes/99999",
            json={
                "content": "Updated content"
            }
        )
        
        # Assert
        assert response.status_code == 404
        assert "note" in response.json()["detail"].lower()
    
    def test_delete_note(self, client, db_session):
        """测试删除笔记"""
        # Arrange: 创建 Episode、Highlight 和 Note
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_008",
            duration=180.0,
            transcription_status="completed"
        )
        db_session.add(episode)
        db_session.commit()
        db_session.refresh(episode)
        
        cue = TranscriptCue(
            episode_id=episode.id,
            start_time=0.0,
            end_time=5.0,
            speaker="Speaker1",
            text="Hello world."
        )
        db_session.add(cue)
        db_session.commit()
        db_session.refresh(cue)
        
        highlight = Highlight(
            episode_id=episode.id,
            cue_id=cue.id,
            start_offset=0,
            end_offset=5,
            highlighted_text="Hello",
            color="#9C27B0"
        )
        db_session.add(highlight)
        db_session.commit()
        db_session.refresh(highlight)
        
        note = Note(
            episode_id=episode.id,
            highlight_id=highlight.id,
            content="Test content",
            note_type="thought"
        )
        db_session.add(note)
        db_session.commit()
        db_session.refresh(note)
        
        note_id = note.id
        
        # Act: DELETE /api/notes/{id}
        response = client.delete(f"/api/notes/{note_id}")
        
        # Assert
        assert response.status_code == 200  # 删除操作返回 200
        data = response.json()
        assert data["success"] is True
        
        # 验证数据库中的记录已删除
        deleted_note = db_session.query(Note).filter_by(id=note_id).first()
        assert deleted_note is None
    
    def test_delete_note_not_found(self, client, db_session):
        """测试删除不存在的笔记"""
        # Act: DELETE /api/notes/99999
        response = client.delete("/api/notes/99999")
        
        # Assert
        assert response.status_code == 404
        assert "note" in response.json()["detail"].lower()
    
    def test_get_notes_by_episode(self, client, db_session):
        """测试获取某个 Episode 的所有笔记"""
        # Arrange: 创建 Episode、多个 Highlight 和 Note
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_009",
            duration=180.0,
            transcription_status="completed"
        )
        db_session.add(episode)
        db_session.commit()
        db_session.refresh(episode)
        
        cue1 = TranscriptCue(
            episode_id=episode.id,
            start_time=0.0,
            end_time=5.0,
            speaker="Speaker1",
            text="First sentence."
        )
        cue2 = TranscriptCue(
            episode_id=episode.id,
            start_time=5.0,
            end_time=10.0,
            speaker="Speaker1",
            text="Second sentence."
        )
        db_session.add_all([cue1, cue2])
        db_session.commit()
        db_session.refresh(cue1)
        db_session.refresh(cue2)
        
        highlight1 = Highlight(
            episode_id=episode.id,
            cue_id=cue1.id,
            start_offset=0,
            end_offset=5,
            highlighted_text="First",
            color="#9C27B0"
        )
        highlight2 = Highlight(
            episode_id=episode.id,
            cue_id=cue2.id,
            start_offset=0,
            end_offset=6,
            highlighted_text="Second",
            color="#9C27B0"
        )
        db_session.add_all([highlight1, highlight2])
        db_session.commit()
        db_session.refresh(highlight1)
        db_session.refresh(highlight2)
        
        note1 = Note(
            episode_id=episode.id,
            highlight_id=highlight1.id,
            content="Note 1",
            note_type="thought"
        )
        note2 = Note(
            episode_id=episode.id,
            highlight_id=highlight2.id,
            content=None,
            note_type="underline"
        )
        note3 = Note(
            episode_id=episode.id,
            highlight_id=highlight2.id,
            content="Note 3",
            note_type="ai_card"
        )
        db_session.add_all([note1, note2, note3])
        db_session.commit()
        
        # Act: GET /api/episodes/{id}/notes
        response = client.get(f"/api/episodes/{episode.id}/notes")
        
        # Assert
        assert response.status_code == 200  # GET 操作返回 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 3  # 包含所有类型的笔记（前端负责过滤 underline）
        
        # 验证返回的数据格式
        note_ids = [n["id"] for n in data]
        assert note1.id in note_ids
        assert note2.id in note_ids
        assert note3.id in note_ids
        
        # 验证每个笔记的数据结构
        note1_data = next(n for n in data if n["id"] == note1.id)
        assert note1_data["highlight_id"] == highlight1.id
        assert note1_data["content"] == "Note 1"
        assert note1_data["note_type"] == "thought"
        assert "created_at" in note1_data
        assert "updated_at" in note1_data
    
    def test_get_notes_by_episode_empty(self, client, db_session):
        """测试获取空 Episode 的笔记列表"""
        # Arrange: 创建 Episode（无笔记）
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_010",
            duration=180.0,
            transcription_status="completed"
        )
        db_session.add(episode)
        db_session.commit()
        db_session.refresh(episode)
        
        # Act: GET /api/episodes/{id}/notes
        response = client.get(f"/api/episodes/{episode.id}/notes")
        
        # Assert
        assert response.status_code == 200  # GET 操作返回 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0
    
    def test_get_notes_by_episode_not_found(self, client, db_session):
        """测试获取不存在的 Episode 的笔记列表"""
        # Act: GET /api/episodes/99999/notes
        response = client.get("/api/episodes/99999/notes")
        
        # Assert
        assert response.status_code == 404
        assert "episode" in response.json()["detail"].lower()
    
    def test_delete_note_cascades_to_highlight_and_ai_query_record(self, client, db_session):
        """测试删除 Note 时，如果没有其他 notes，会级联删除 Highlight 和 AIQueryRecord"""
        # Arrange: 创建 Episode、Highlight、AIQueryRecord 和 Note
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_011",
            duration=180.0,
            transcription_status="completed"
        )
        db_session.add(episode)
        db_session.commit()
        db_session.refresh(episode)
        
        cue = TranscriptCue(
            episode_id=episode.id,
            start_time=0.0,
            end_time=5.0,
            speaker="Speaker1",
            text="Hello world."
        )
        db_session.add(cue)
        db_session.commit()
        db_session.refresh(cue)
        
        highlight = Highlight(
            episode_id=episode.id,
            cue_id=cue.id,
            start_offset=0,
            end_offset=5,
            highlighted_text="Hello",
            color="#9C27B0"
        )
        db_session.add(highlight)
        db_session.commit()
        db_session.refresh(highlight)
        
        import json
        response_json = {"type": "word", "content": {"definition": "问候", "explanation": "A greeting."}}
        ai_query = AIQueryRecord(
            highlight_id=highlight.id,
            query_text="Hello",
            context_text="Hello world.",
            response_text=json.dumps(response_json),
            detected_type="word",
            provider="gemini-2.5-flash",
            status="completed"
        )
        db_session.add(ai_query)
        db_session.commit()
        db_session.refresh(ai_query)
        
        # Note 的 content 格式化为可读文本（从 JSON 提取）
        note_content = f"{response_json['content']['definition']}\n{response_json['content']['explanation']}"
        note = Note(
            episode_id=episode.id,
            highlight_id=highlight.id,
            content=note_content,
            note_type="ai_card",
            origin_ai_query_id=ai_query.id
        )
        db_session.add(note)
        db_session.commit()
        db_session.refresh(note)
        
        ai_query_id = ai_query.id
        highlight_id = highlight.id
        note_id = note.id
        
        # Act: DELETE /api/notes/{id}
        response = client.delete(f"/api/notes/{note_id}")
        
        # Assert
        assert response.status_code == 200  # 删除操作返回 200
        
        # 验证 Note 已删除
        deleted_note = db_session.query(Note).filter_by(id=note_id).first()
        assert deleted_note is None
        
        # 验证 Highlight 已删除（因为没有其他 notes）
        deleted_highlight = db_session.query(Highlight).filter_by(id=highlight_id).first()
        assert deleted_highlight is None
        
        # 验证 AIQueryRecord 已级联删除
        deleted_ai_query = db_session.query(AIQueryRecord).filter_by(id=ai_query_id).first()
        assert deleted_ai_query is None

