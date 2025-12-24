"""
测试新数据库模型（Task 1.1）
按照开发计划.md的8个表设计进行测试
"""
import pytest
from datetime import datetime
from sqlalchemy.exc import IntegrityError


def test_podcast_model_creation(db_session):
    """测试 Podcast 模型创建"""
    from app.models import Podcast
    
    podcast = Podcast(
        title="Lenny's Podcast",
        source_url="https://example.com/podcast",
        description="A podcast about product management",
        cover_image="/images/lenny_podcast.jpg"
    )
    db_session.add(podcast)
    db_session.commit()
    
    # 验证数据已插入
    assert podcast.id is not None
    assert podcast.title == "Lenny's Podcast"
    assert podcast.source_url == "https://example.com/podcast"
    assert podcast.description == "A podcast about product management"
    assert podcast.cover_image == "/images/lenny_podcast.jpg"
    assert podcast.created_at is not None
    assert isinstance(podcast.created_at, datetime)


def test_podcast_model_nullable_fields(db_session):
    """测试 Podcast 模型可选字段"""
    from app.models import Podcast
    
    # 只提供必需字段（title）
    podcast = Podcast(
        title="Minimal Podcast"
    )
    db_session.add(podcast)
    db_session.commit()
    
    # 验证可选字段可以为空
    assert podcast.id is not None
    assert podcast.title == "Minimal Podcast"
    assert podcast.source_url is None
    assert podcast.description is None
    assert podcast.cover_image is None
    assert podcast.created_at is not None


def test_podcast_model_title_required(db_session):
    """测试 Podcast 模型 title 字段必需"""
    from app.models import Podcast
    from sqlalchemy.exc import IntegrityError
    
    # 不提供 title 字段（应该失败）
    podcast = Podcast(
        source_url="https://example.com/podcast"
    )
    db_session.add(podcast)
    
    # 验证提交时会抛出 IntegrityError（因为 title 是 NOT NULL）
    with pytest.raises(IntegrityError) as exc_info:
        db_session.commit()
    
    # 验证错误信息包含 title 字段
    assert "title" in str(exc_info.value).lower()


def test_podcast_crud_operations(db_session):
    """测试 Podcast 的 CRUD 操作"""
    from app.models import Podcast
    
    # Create
    podcast = Podcast(
        title="CRUD Test Podcast",
        source_url="https://example.com/crud",
        description="Testing CRUD operations"
    )
    db_session.add(podcast)
    db_session.commit()
    podcast_id = podcast.id
    
    # Read
    retrieved = db_session.query(Podcast).filter(Podcast.id == podcast_id).first()
    assert retrieved is not None
    assert retrieved.title == "CRUD Test Podcast"
    assert retrieved.source_url == "https://example.com/crud"
    
    # Update
    retrieved.title = "Updated Podcast Title"
    retrieved.description = "Updated description"
    db_session.commit()
    
    updated = db_session.query(Podcast).filter(Podcast.id == podcast_id).first()
    assert updated.title == "Updated Podcast Title"
    assert updated.description == "Updated description"
    
    # Delete
    db_session.delete(updated)
    db_session.commit()
    
    deleted = db_session.query(Podcast).filter(Podcast.id == podcast_id).first()
    assert deleted is None


def test_podcast_query_by_title(db_session):
    """测试通过 title 查询 Podcast"""
    from app.models import Podcast
    
    # 创建多个 Podcast
    podcast1 = Podcast(title="Tech Podcast", description="About technology")
    podcast2 = Podcast(title="Business Podcast", description="About business")
    podcast3 = Podcast(title="Tech Talk", description="Another tech podcast")
    
    db_session.add_all([podcast1, podcast2, podcast3])
    db_session.commit()
    
    # 查询包含 "Tech" 的 Podcast
    tech_podcasts = db_session.query(Podcast).filter(
        Podcast.title.like("%Tech%")
    ).all()
    
    assert len(tech_podcasts) == 2
    assert all("Tech" in p.title for p in tech_podcasts)


def test_podcast_created_at_auto_set(db_session):
    """测试 Podcast 的 created_at 自动设置"""
    from app.models import Podcast
    
    before_creation = datetime.utcnow()
    
    podcast = Podcast(title="Time Test Podcast")
    db_session.add(podcast)
    db_session.commit()
    
    after_creation = datetime.utcnow()
    
    # 验证 created_at 在创建时间范围内
    assert before_creation <= podcast.created_at <= after_creation


def test_podcast_model_string_representation(db_session):
    """测试 Podcast 模型的字符串表示（如果实现了 __repr__）"""
    from app.models import Podcast
    
    podcast = Podcast(
        title="Repr Test Podcast",
        source_url="https://example.com/repr"
    )
    db_session.add(podcast)
    db_session.commit()
    
    # 如果实现了 __repr__，测试其输出
    # 这里只是基础测试，确保对象可以转换为字符串
    assert str(podcast) is not None
    assert repr(podcast) is not None


def test_podcast_source_url_unique_constraint(db_session):
    """测试 source_url 唯一性约束（防止重复添加）"""
    from app.models import Podcast
    from sqlalchemy.exc import IntegrityError
    
    # 创建第一个 Podcast
    podcast1 = Podcast(
        title="Lenny's Podcast",
        source_url="https://example.com/feed"
    )
    db_session.add(podcast1)
    db_session.commit()
    
    # 尝试创建相同 source_url 的 Podcast（应该失败）
    podcast2 = Podcast(
        title="Lenny's Podcast (Duplicate)",
        source_url="https://example.com/feed"  # 相同的 source_url
    )
    db_session.add(podcast2)
    
    # 验证：提交时会抛出 IntegrityError
    with pytest.raises(IntegrityError) as exc_info:
        db_session.commit()
    
    # 验证错误信息包含 source_url
    assert "source_url" in str(exc_info.value).lower() or "unique" in str(exc_info.value).lower()


def test_podcast_same_title_different_url_allowed(db_session):
    """测试：同名但不同 source_url 的 Podcast 允许存在"""
    from app.models import Podcast
    
    # 创建两个同名但不同源的 Podcast
    podcast1 = Podcast(
        title="The Daily",
        source_url="https://nytimes.com/daily"
    )
    podcast2 = Podcast(
        title="The Daily",
        source_url="https://wsj.com/daily"
    )
    
    db_session.add_all([podcast1, podcast2])
    db_session.commit()
    
    # 验证：两个都成功创建
    podcasts = db_session.query(Podcast).filter(
        Podcast.title == "The Daily"
    ).all()
    
    assert len(podcasts) == 2
    assert podcasts[0].source_url != podcasts[1].source_url
    assert podcasts[0].title == podcasts[1].title


def test_podcast_null_source_url_allowed(db_session):
    """测试：source_url 为 NULL 时不受唯一约束限制"""
    from app.models import Podcast
    
    # 创建两个 source_url 为 NULL 的 Podcast（都允许）
    podcast1 = Podcast(title="Manual Podcast 1", source_url=None)
    podcast2 = Podcast(title="Manual Podcast 2", source_url=None)
    
    db_session.add_all([podcast1, podcast2])
    db_session.commit()
    
    # 验证：两个都成功创建（NULL 不受唯一约束限制）
    assert podcast1.id is not None
    assert podcast2.id is not None
    assert podcast1.source_url is None
    assert podcast2.source_url is None


