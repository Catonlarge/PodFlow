"""
测试数据库操作
"""
import pytest
from datetime import datetime
from app.models import Lesson, Note, Vocabulary, init_db


def test_lesson_model(db_session):
    """测试 Lesson 模型"""
    lesson = Lesson(
        title="Test Lesson",
        audio_path="/path/to/audio.mp3",
        transcript="This is a test transcript"
    )
    db_session.add(lesson)
    db_session.commit()
    
    assert lesson.id is not None
    assert lesson.title == "Test Lesson"
    assert lesson.created_at is not None


def test_note_model(db_session):
    """测试 Note 模型"""
    note = Note(
        lesson_id=1,
        content="This is a test note",
        timestamp=10.5
    )
    db_session.add(note)
    db_session.commit()
    
    assert note.id is not None
    assert note.lesson_id == 1
    assert note.content == "This is a test note"
    assert note.timestamp == 10.5


def test_vocabulary_model(db_session):
    """测试 Vocabulary 模型"""
    vocab = Vocabulary(
        word="hello",
        definition="a greeting",
        lesson_id=1
    )
    db_session.add(vocab)
    db_session.commit()
    
    assert vocab.id is not None
    assert vocab.word == "hello"
    assert vocab.definition == "a greeting"
    assert vocab.lesson_id == 1


def test_lesson_crud(db_session):
    """测试 Lesson 的 CRUD 操作"""
    # Create
    lesson = Lesson(
        title="CRUD Test",
        audio_path="/test/audio.mp3",
        transcript="Test transcript"
    )
    db_session.add(lesson)
    db_session.commit()
    lesson_id = lesson.id
    
    # Read
    retrieved_lesson = db_session.query(Lesson).filter(Lesson.id == lesson_id).first()
    assert retrieved_lesson is not None
    assert retrieved_lesson.title == "CRUD Test"
    
    # Update
    retrieved_lesson.title = "Updated Title"
    db_session.commit()
    updated_lesson = db_session.query(Lesson).filter(Lesson.id == lesson_id).first()
    assert updated_lesson.title == "Updated Title"
    
    # Delete
    db_session.delete(updated_lesson)
    db_session.commit()
    deleted_lesson = db_session.query(Lesson).filter(Lesson.id == lesson_id).first()
    assert deleted_lesson is None

