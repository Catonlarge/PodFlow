# -*- coding: utf-8 -*-
"""
Highlight API 单元测试

测试覆盖：
1. 创建划线（单 cue、跨 cue）
2. 验证逻辑（episode_id、cue_id 关联验证）
3. 获取划线列表
4. 删除划线（按组删除、级联删除）
"""
import pytest
from datetime import datetime
from fastapi.testclient import TestClient

from app.models import Episode, TranscriptCue, Highlight, Note, AIQueryRecord


@pytest.mark.unit
class TestHighlightAPI:
    """Highlight API 单元测试"""
    
    def test_create_single_cue_highlight(self, client, db_session):
        """测试创建单 cue 划线（90% 场景）"""
        # Arrange: 创建 Episode 和 TranscriptCue
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
        
        # Act: POST /api/highlights (highlight_group_id = None)
        response = client.post(
            "/api/highlights",
            json={
                "episode_id": episode.id,
                "highlights": [
                    {
                        "cue_id": cue.id,
                        "start_offset": 6,
                        "end_offset": 12,
                        "highlighted_text": "world.",
                        "color": "#9C27B0"
                    }
                ],
                "highlight_group_id": None
            }
        )
        
        # Assert: 验证 Highlight 创建成功，highlight_group_id 为 None
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["highlight_ids"]) == 1
        
        highlight = db_session.query(Highlight).filter(Highlight.id == data["highlight_ids"][0]).first()
        assert highlight is not None
        assert highlight.cue_id == cue.id
        assert highlight.episode_id == episode.id
        assert highlight.highlight_group_id is None
        assert highlight.highlighted_text == "world."
        assert highlight.start_offset == 6
        assert highlight.end_offset == 12
    
    def test_create_cross_cue_highlights(self, client, db_session):
        """测试创建跨 cue 划线（10% 场景）"""
        # Arrange: 创建 Episode 和多个 TranscriptCue
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_002",
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
            text="Hello world."
        )
        cue2 = TranscriptCue(
            episode_id=episode.id,
            start_time=5.0,
            end_time=10.0,
            speaker="Speaker2",
            text="This is a test."
        )
        db_session.add_all([cue1, cue2])
        db_session.commit()
        db_session.refresh(cue1)
        db_session.refresh(cue2)
        
        group_id = "uuid-12345"
        
        # Act: POST /api/highlights (多个 Highlight，共享 highlight_group_id)
        response = client.post(
            "/api/highlights",
            json={
                "episode_id": episode.id,
                "highlights": [
                    {
                        "cue_id": cue1.id,
                        "start_offset": 6,
                        "end_offset": 12,
                        "highlighted_text": "world.",
                        "color": "#9C27B0"
                    },
                    {
                        "cue_id": cue2.id,
                        "start_offset": 0,
                        "end_offset": 15,
                        "highlighted_text": "This is a test.",
                        "color": "#9C27B0"
                    }
                ],
                "highlight_group_id": group_id
            }
        )
        
        # Assert: 验证所有 Highlight 创建成功，highlight_group_id 相同
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["highlight_ids"]) == 2
        assert data["highlight_group_id"] == group_id
        
        highlights = db_session.query(Highlight).filter(
            Highlight.id.in_(data["highlight_ids"])
        ).all()
        
        assert len(highlights) == 2
        assert highlights[0].highlight_group_id == group_id
        assert highlights[1].highlight_group_id == group_id
    
    def test_create_highlights_validate_episode(self, client, db_session):
        """测试创建划线时验证 episode_id 存在"""
        # Arrange: 不创建 Episode
        # Act: POST /api/highlights (episode_id 不存在)
        response = client.post(
            "/api/highlights",
            json={
                "episode_id": 99999,
                "highlights": [
                    {
                        "cue_id": 1,
                        "start_offset": 0,
                        "end_offset": 5,
                        "highlighted_text": "test",
                        "color": "#9C27B0"
                    }
                ]
            }
        )
        
        # Assert: 返回 404 错误
        assert response.status_code == 404
    
    def test_create_highlights_validate_cue_belongs_to_episode(self, client, db_session):
        """测试创建划线时验证 cue_id 属于 episode_id"""
        # Arrange: 创建两个 Episode 和各自的 Cue
        episode1 = Episode(
            title="Episode 1",
            file_hash="test_hash_003",
            duration=180.0,
            transcription_status="completed"
        )
        episode2 = Episode(
            title="Episode 2",
            file_hash="test_hash_004",
            duration=180.0,
            transcription_status="completed"
        )
        db_session.add_all([episode1, episode2])
        db_session.commit()
        db_session.refresh(episode1)
        db_session.refresh(episode2)
        
        cue1 = TranscriptCue(
            episode_id=episode1.id,
            start_time=0.0,
            end_time=5.0,
            speaker="Speaker1",
            text="Episode 1 text"
        )
        db_session.add(cue1)
        db_session.commit()
        db_session.refresh(cue1)
        
        # Act: POST /api/highlights (cue_id 属于另一个 episode)
        response = client.post(
            "/api/highlights",
            json={
                "episode_id": episode2.id,
                "highlights": [
                    {
                        "cue_id": cue1.id,
                        "start_offset": 0,
                        "end_offset": 5,
                        "highlighted_text": "test",
                        "color": "#9C27B0"
                    }
                ]
            }
        )
        
        # Assert: 返回 400 错误
        assert response.status_code == 400
    
    def test_get_highlights_by_episode(self, client, db_session):
        """测试获取某个 Episode 的所有划线"""
        # Arrange: 创建 Episode 和多个 Highlight（单 cue + 跨 cue）
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_005",
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
            speaker="Speaker2",
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
            highlight_group_id=None
        )
        highlight2 = Highlight(
            episode_id=episode.id,
            cue_id=cue1.id,
            start_offset=6,
            end_offset=14,
            highlighted_text="sentence.",
            highlight_group_id="group-001"
        )
        highlight3 = Highlight(
            episode_id=episode.id,
            cue_id=cue2.id,
            start_offset=0,
            end_offset=7,
            highlighted_text="Second",
            highlight_group_id="group-001"
        )
        db_session.add_all([highlight1, highlight2, highlight3])
        db_session.commit()
        
        # Act: GET /api/episodes/{episode_id}/highlights
        response = client.get(f"/api/episodes/{episode.id}/highlights")
        
        # Assert: 验证返回所有 Highlight，按 created_at 排序
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3
        assert data[0]["id"] == highlight1.id
        assert data[1]["id"] == highlight2.id
        assert data[2]["id"] == highlight3.id
    
    def test_delete_single_cue_highlight(self, client, db_session):
        """测试删除单 cue 划线（highlight_group_id = None）"""
        # Arrange: 创建单 cue Highlight 和关联的 Note
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_006",
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
            text="Test text"
        )
        db_session.add(cue)
        db_session.commit()
        db_session.refresh(cue)
        
        highlight = Highlight(
            episode_id=episode.id,
            cue_id=cue.id,
            start_offset=0,
            end_offset=4,
            highlighted_text="Test",
            highlight_group_id=None
        )
        db_session.add(highlight)
        db_session.commit()
        db_session.refresh(highlight)
        
        note = Note(
            episode_id=episode.id,
            highlight_id=highlight.id,
            note_type="thought",
            content="Test note"
        )
        db_session.add(note)
        db_session.commit()
        db_session.refresh(note)
        
        # Act: DELETE /api/highlights/{id}
        response = client.delete(f"/api/highlights/{highlight.id}")
        
        # Assert: 验证只删除当前 Highlight，关联的 Note 被级联删除
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["deleted_highlights_count"] == 1
        assert data["deleted_notes_count"] == 1
        
        deleted_highlight = db_session.query(Highlight).filter(Highlight.id == highlight.id).first()
        assert deleted_highlight is None
        
        deleted_note = db_session.query(Note).filter(Note.id == note.id).first()
        assert deleted_note is None
    
    def test_delete_cross_cue_highlights_by_group(self, client, db_session):
        """测试删除跨 cue 划线（按组删除）"""
        # Arrange: 创建跨 cue Highlight（3个，共享 highlight_group_id）和关联的 Note
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_007",
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
            text="First"
        )
        cue2 = TranscriptCue(
            episode_id=episode.id,
            start_time=5.0,
            end_time=10.0,
            speaker="Speaker2",
            text="Second"
        )
        cue3 = TranscriptCue(
            episode_id=episode.id,
            start_time=10.0,
            end_time=15.0,
            speaker="Speaker3",
            text="Third"
        )
        db_session.add_all([cue1, cue2, cue3])
        db_session.commit()
        db_session.refresh(cue1)
        db_session.refresh(cue2)
        db_session.refresh(cue3)
        
        group_id = "group-002"
        highlight1 = Highlight(
            episode_id=episode.id,
            cue_id=cue1.id,
            start_offset=0,
            end_offset=5,
            highlighted_text="First",
            highlight_group_id=group_id
        )
        highlight2 = Highlight(
            episode_id=episode.id,
            cue_id=cue2.id,
            start_offset=0,
            end_offset=6,
            highlighted_text="Second",
            highlight_group_id=group_id
        )
        highlight3 = Highlight(
            episode_id=episode.id,
            cue_id=cue3.id,
            start_offset=0,
            end_offset=5,
            highlighted_text="Third",
            highlight_group_id=group_id
        )
        db_session.add_all([highlight1, highlight2, highlight3])
        db_session.commit()
        db_session.refresh(highlight1)
        db_session.refresh(highlight2)
        db_session.refresh(highlight3)
        
        note1 = Note(
            episode_id=episode.id,
            highlight_id=highlight1.id,
            note_type="thought",
            content="Note 1"
        )
        note2 = Note(
            episode_id=episode.id,
            highlight_id=highlight2.id,
            note_type="thought",
            content="Note 2"
        )
        db_session.add_all([note1, note2])
        db_session.commit()
        
        # Act: DELETE /api/highlights/{id} (删除其中一个)
        response = client.delete(f"/api/highlights/{highlight1.id}")
        
        # Assert: 验证整组 Highlight 被删除，所有关联的 Note 被级联删除
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["deleted_highlights_count"] == 3
        assert data["deleted_notes_count"] == 2
        
        deleted_highlights = db_session.query(Highlight).filter(
            Highlight.highlight_group_id == group_id
        ).all()
        assert len(deleted_highlights) == 0
        
        deleted_notes = db_session.query(Note).filter(
            Note.id.in_([note1.id, note2.id])
        ).all()
        assert len(deleted_notes) == 0
    
    def test_delete_highlight_cascade_delete_notes(self, client, db_session):
        """测试删除 Highlight 时级联删除 Note"""
        # Arrange: 创建 Highlight 和多个 Note
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
            text="Test text"
        )
        db_session.add(cue)
        db_session.commit()
        db_session.refresh(cue)
        
        highlight = Highlight(
            episode_id=episode.id,
            cue_id=cue.id,
            start_offset=0,
            end_offset=4,
            highlighted_text="Test",
            highlight_group_id=None
        )
        db_session.add(highlight)
        db_session.commit()
        db_session.refresh(highlight)
        
        note1 = Note(
            episode_id=episode.id,
            highlight_id=highlight.id,
            note_type="thought",
            content="Note 1"
        )
        note2 = Note(
            episode_id=episode.id,
            highlight_id=highlight.id,
            note_type="ai_card",
            content="Note 2"
        )
        db_session.add_all([note1, note2])
        db_session.commit()
        
        # Act: DELETE /api/highlights/{id}
        response = client.delete(f"/api/highlights/{highlight.id}")
        
        # Assert: 验证所有关联的 Note 被删除
        assert response.status_code == 200
        data = response.json()
        assert data["deleted_notes_count"] == 2
        
        deleted_notes = db_session.query(Note).filter(
            Note.id.in_([note1.id, note2.id])
        ).all()
        assert len(deleted_notes) == 0
    
    def test_delete_highlight_cascade_delete_ai_queries(self, client, db_session):
        """测试删除 Highlight 时级联删除 AIQueryRecord"""
        # Arrange: 创建 Highlight 和多个 AIQueryRecord
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_009",
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
            text="Test text"
        )
        db_session.add(cue)
        db_session.commit()
        db_session.refresh(cue)
        
        highlight = Highlight(
            episode_id=episode.id,
            cue_id=cue.id,
            start_offset=0,
            end_offset=4,
            highlighted_text="Test",
            highlight_group_id=None
        )
        db_session.add(highlight)
        db_session.commit()
        db_session.refresh(highlight)
        
        import json
        response_json1 = {"type": "word", "content": {"definition": "测试"}}
        response_json2 = {"type": "phrase", "content": {"definition": "解释"}}
        ai_query1 = AIQueryRecord(
            highlight_id=highlight.id,
            query_text="Test",
            response_text=json.dumps(response_json1),
            detected_type="word",
            provider="gemini-2.5-flash",
            status="completed"
        )
        ai_query2 = AIQueryRecord(
            highlight_id=highlight.id,
            query_text="Test",
            response_text=json.dumps(response_json2),
            detected_type="phrase",
            provider="gemini-2.5-flash",
            status="completed"
        )
        db_session.add_all([ai_query1, ai_query2])
        db_session.commit()
        
        # Act: DELETE /api/highlights/{id}
        response = client.delete(f"/api/highlights/{highlight.id}")
        
        # Assert: 验证所有关联的 AIQueryRecord 被删除
        assert response.status_code == 200
        data = response.json()
        assert data["deleted_ai_queries_count"] == 2
        
        deleted_queries = db_session.query(AIQueryRecord).filter(
            AIQueryRecord.id.in_([ai_query1.id, ai_query2.id])
        ).all()
        assert len(deleted_queries) == 0
    
    def test_delete_highlight_return_statistics(self, client, db_session):
        """测试删除 Highlight 时返回统计信息"""
        # Arrange: 创建 Highlight、Note 和 AIQueryRecord
        episode = Episode(
            title="Test Episode",
            file_hash="test_hash_010",
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
            text="Test text"
        )
        db_session.add(cue)
        db_session.commit()
        db_session.refresh(cue)
        
        highlight = Highlight(
            episode_id=episode.id,
            cue_id=cue.id,
            start_offset=0,
            end_offset=4,
            highlighted_text="Test",
            highlight_group_id=None
        )
        db_session.add(highlight)
        db_session.commit()
        db_session.refresh(highlight)
        
        note = Note(
            episode_id=episode.id,
            highlight_id=highlight.id,
            note_type="thought",
            content="Test note"
        )
        import json
        response_json = {"type": "word", "content": {"definition": "测试"}}
        ai_query = AIQueryRecord(
            highlight_id=highlight.id,
            query_text="Test",
            response_text=json.dumps(response_json),
            detected_type="word",
            provider="gemini-2.5-flash",
            status="completed"
        )
        db_session.add_all([note, ai_query])
        db_session.commit()
        
        # Act: DELETE /api/highlights/{id}
        response = client.delete(f"/api/highlights/{highlight.id}")
        
        # Assert: 验证响应包含 deleted_highlights_count、deleted_notes_count、deleted_ai_queries_count
        assert response.status_code == 200
        data = response.json()
        assert "success" in data
        assert "deleted_highlights_count" in data
        assert "deleted_notes_count" in data
        assert "deleted_ai_queries_count" in data
        assert data["deleted_highlights_count"] == 1
        assert data["deleted_notes_count"] == 1
        assert data["deleted_ai_queries_count"] == 1

