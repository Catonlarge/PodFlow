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


# ==================== Episode 表测试 ====================

def test_episode_model_creation(db_session):
    """测试 Episode 模型创建（基础字段）"""
    from app.models import Episode
    
    episode = Episode(
        title="Test Episode",
        original_filename="test_audio.mp3",
        original_path="/user/path/test_audio.mp3",
        audio_path="backend/data/audios/abc123.mp3",
        file_hash="abc123def456",
        file_size=10485760,  # 10MB
        duration=600.0,  # 10 分钟
        language="en-US"
    )
    db_session.add(episode)
    db_session.commit()
    
    # 验证数据已插入
    assert episode.id is not None
    assert episode.title == "Test Episode"
    assert episode.file_hash == "abc123def456"
    assert episode.duration == 600.0
    assert episode.language == "en-US"
    assert episode.created_at is not None
    assert episode.updated_at is not None
    
    # 验证 @property 动态计算（基于全局配置 180s）
    assert episode.segment_duration == 180
    assert episode.needs_segmentation is True  # 600 > 180
    assert episode.total_segments == 4  # ceil(600 / 180) = 4


def test_episode_with_podcast_relationship(db_session):
    """测试 Episode 与 Podcast 的关联关系"""
    from app.models import Podcast, Episode
    
    # 创建 Podcast
    podcast = Podcast(title="Lenny's Podcast")
    db_session.add(podcast)
    db_session.commit()
    
    # 创建关联的 Episode
    episode = Episode(
        title="Episode 1",
        podcast_id=podcast.id,
        file_hash="hash001",
        duration=300.0,
        language="en-US"
    )
    db_session.add(episode)
    db_session.commit()
    
    # 验证关联
    assert episode.podcast_id == podcast.id
    assert episode.podcast.title == "Lenny's Podcast"
    
    # 验证 show_name 属性（从 Podcast 获取）
    assert episode.show_name == "Lenny's Podcast"


def test_episode_local_audio_without_podcast(db_session):
    """测试本地音频（无 Podcast 关联）"""
    from app.models import Episode
    
    # 创建本地音频（podcast_id 为 NULL）
    episode = Episode(
        title="Local Audio File",
        podcast_id=None,  # 本地音频
        file_hash="local001",
        duration=180.0,
        language="zh-CN"  # 中文音频
    )
    db_session.add(episode)
    db_session.commit()
    
    # 验证：podcast_id 可以为空
    assert episode.id is not None
    assert episode.podcast_id is None
    
    # 验证 show_name 属性（返回默认值）
    assert episode.show_name == "本地音频"


def test_episode_file_hash_unique_constraint(db_session):
    """测试 file_hash 唯一性约束（防止重复上传）"""
    from app.models import Episode
    from sqlalchemy.exc import IntegrityError
    
    # 创建第一个 Episode
    episode1 = Episode(
        title="Episode 1",
        file_hash="same_hash_123",
        duration=300.0,
        language="en-US"
    )
    db_session.add(episode1)
    db_session.commit()
    
    # 尝试创建相同 file_hash 的 Episode（应该失败）
    episode2 = Episode(
        title="Episode 2 (Duplicate)",
        file_hash="same_hash_123",  # 相同的 hash
        duration=300.0,
        language="en-US"
    )
    db_session.add(episode2)
    
    # 验证：提交时会抛出 IntegrityError
    with pytest.raises(IntegrityError) as exc_info:
        db_session.commit()
    
    assert "file_hash" in str(exc_info.value).lower() or "unique" in str(exc_info.value).lower()


def test_episode_needs_segmentation_auto_set(db_session):
    """测试 needs_segmentation 属性的逻辑（基于全局配置动态计算）"""
    from app.models import Episode
    
    # 短音频（< 180s）
    short_episode = Episode(
        title="Short Episode",
        file_hash="short001",
        duration=120.0  # 2 分钟
    )
    db_session.add(short_episode)
    
    # 长音频（> 180s）
    long_episode = Episode(
        title="Long Episode",
        file_hash="long001",
        duration=600.0  # 10 分钟
    )
    db_session.add(long_episode)
    
    db_session.commit()
    
    # 验证 @property 动态计算（基于全局配置 180s）
    assert short_episode.segment_duration == 180
    assert short_episode.needs_segmentation is False  # 120 <= 180
    assert short_episode.total_segments == 1
    
    assert long_episode.segment_duration == 180
    assert long_episode.needs_segmentation is True  # 600 > 180
    assert long_episode.total_segments == 4  # ceil(600 / 180) = 4


def test_episode_segmentation_properties_with_different_durations(db_session):
    """测试不同时长音频的分段属性计算"""
    from app.models import Episode
    import math
    
    test_cases = [
        # (duration, expected_needs_seg, expected_total_segments)
        (60.0, False, 1),      # 1 分钟
        (180.0, False, 1),     # 恰好 180 秒（边界值）
        (181.0, True, 2),      # 刚超过 180 秒
        (360.0, True, 2),      # 6 分钟
        (540.0, True, 3),      # 9 分钟
        (541.0, True, 4),      # 刚超过 9 分钟
        (1800.0, True, 10),    # 30 分钟
    ]
    
    for i, (duration, expected_needs_seg, expected_total_segments) in enumerate(test_cases):
        episode = Episode(
            title=f"Episode {i}",
            file_hash=f"hash{i:03d}",
            duration=duration
        )
        db_session.add(episode)
        db_session.commit()
        
        # 验证
        assert episode.needs_segmentation == expected_needs_seg, \
            f"duration={duration}, expected needs_segmentation={expected_needs_seg}, got {episode.needs_segmentation}"
        assert episode.total_segments == expected_total_segments, \
            f"duration={duration}, expected total_segments={expected_total_segments}, got {episode.total_segments}"
        
        # 验证计算逻辑
        if episode.needs_segmentation:
            expected = math.ceil(duration / 180)
            assert episode.total_segments == expected


def test_episode_transcription_timestamps(db_session):
    """测试转录时间戳字段"""
    from app.models import Episode
    from datetime import datetime
    
    episode = Episode(
        title="Timestamp Test",
        file_hash="timestamp001",
        duration=300.0,
        transcription_started_at=datetime.utcnow()
    )
    db_session.add(episode)
    db_session.commit()
    
    # 验证：started_at 已设置
    assert episode.transcription_started_at is not None
    
    # 模拟转录完成
    episode.transcription_completed_at = datetime.utcnow()
    db_session.commit()
    
    # 验证：completed_at 已设置
    assert episode.transcription_completed_at is not None
    assert episode.transcription_completed_at >= episode.transcription_started_at


def test_episode_crud_operations(db_session):
    """测试 Episode 的 CRUD 操作"""
    from app.models import Episode
    
    # Create
    episode = Episode(
        title="CRUD Test Episode",
        file_hash="crud001",
        audio_path="backend/data/audios/crud001.mp3",
        duration=240.0,
        language="en-US"
    )
    db_session.add(episode)
    db_session.commit()
    episode_id = episode.id
    
    # Read
    retrieved = db_session.query(Episode).filter(Episode.id == episode_id).first()
    assert retrieved is not None
    assert retrieved.title == "CRUD Test Episode"
    assert retrieved.file_hash == "crud001"
    
    # Update
    retrieved.title = "Updated Episode Title"
    retrieved.language = "zh-CN"
    db_session.commit()
    
    updated = db_session.query(Episode).filter(Episode.id == episode_id).first()
    assert updated.title == "Updated Episode Title"
    assert updated.language == "zh-CN"
    
    # Delete
    db_session.delete(updated)
    db_session.commit()
    
    deleted = db_session.query(Episode).filter(Episode.id == episode_id).first()
    assert deleted is None


def test_episode_updated_at_auto_update(db_session):
    """测试 updated_at 自动更新"""
    from app.models import Episode
    from datetime import datetime
    import time
    
    episode = Episode(
        title="Update Time Test",
        file_hash="update001",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    original_updated_at = episode.updated_at
    
    # 等待一小段时间
    time.sleep(0.1)
    
    # 更新 Episode
    episode.title = "Updated Title"
    db_session.commit()
    
    # 验证：updated_at 已更新
    assert episode.updated_at > original_updated_at


# ==================== AudioSegment 表测试 ====================

def test_audio_segment_model_creation(db_session):
    """测试 AudioSegment 模型创建（包含所有字段）"""
    from app.models import Episode, AudioSegment
    
    # 先创建 Episode
    episode = Episode(
        title="Test Episode for Segment",
        file_hash="segment_test_001",
        duration=600.0
    )
    db_session.add(episode)
    db_session.commit()
    
    # 创建 AudioSegment
    segment = AudioSegment(
        episode_id=episode.id,
        segment_index=0,
        segment_id="segment_001",
        segment_path=None,  # 虚拟分段
        start_time=0.0,
        end_time=180.0,
        duration=180.0,
        status="pending",
        retry_count=0
    )
    db_session.add(segment)
    db_session.commit()
    
    # 验证数据已插入
    assert segment.id is not None
    assert segment.episode_id == episode.id
    assert segment.segment_index == 0
    assert segment.segment_id == "segment_001"
    assert segment.segment_path is None  # 虚拟分段
    assert segment.start_time == 0.0
    assert segment.end_time == 180.0
    assert segment.duration == 180.0
    assert segment.status == "pending"
    assert segment.error_message is None
    assert segment.retry_count == 0
    assert segment.transcription_started_at is None
    assert segment.recognized_at is None
    assert segment.created_at is not None


def test_audio_segment_relationship_with_episode(db_session):
    """测试 AudioSegment 与 Episode 的关系"""
    from app.models import Episode, AudioSegment
    
    # 创建 Episode
    episode = Episode(
        title="Episode with Segments",
        file_hash="episode_segments_001",
        duration=600.0
    )
    db_session.add(episode)
    db_session.commit()
    
    # 创建多个 AudioSegment
    segment1 = AudioSegment(
        episode_id=episode.id,
        segment_index=0,
        segment_id="segment_001",
        segment_path=None,
        start_time=0.0,
        end_time=180.0,
        duration=180.0,
        status="pending"
    )
    segment2 = AudioSegment(
        episode_id=episode.id,
        segment_index=1,
        segment_id="segment_002",
        segment_path=None,
        start_time=180.0,
        end_time=360.0,
        duration=180.0,
        status="pending"
    )
    db_session.add_all([segment1, segment2])
    db_session.commit()
    
    # 验证关系
    assert len(episode.segments) == 2
    assert episode.segments[0].segment_index == 0
    assert episode.segments[1].segment_index == 1
    assert segment1.episode == episode
    assert segment2.episode == episode


def test_audio_segment_status_and_retry(db_session):
    """测试 AudioSegment 状态更新和重试机制"""
    from app.models import Episode, AudioSegment
    from datetime import datetime
    
    # 创建 Episode 和 Segment
    episode = Episode(
        title="Status Test Episode",
        file_hash="status_test_001",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    segment = AudioSegment(
        episode_id=episode.id,
        segment_index=0,
        segment_id="segment_001",
        segment_path=None,
        start_time=0.0,
        end_time=180.0,
        duration=180.0,
        status="pending",
        retry_count=0
    )
    db_session.add(segment)
    db_session.commit()
    
    # 模拟开始转录
    segment.status = "processing"
    segment.transcription_started_at = datetime.utcnow()
    db_session.commit()
    
    assert segment.status == "processing"
    assert segment.transcription_started_at is not None
    
    # 模拟转录失败
    segment.status = "failed"
    segment.error_message = "FFmpeg error: Invalid codec"
    segment.retry_count += 1
    db_session.commit()
    
    assert segment.status == "failed"
    assert segment.error_message == "FFmpeg error: Invalid codec"
    assert segment.retry_count == 1
    
    # 模拟重试成功
    segment.status = "processing"
    segment.transcription_started_at = datetime.utcnow()
    db_session.commit()
    
    segment.status = "completed"
    segment.recognized_at = datetime.utcnow()
    db_session.commit()
    
    assert segment.status == "completed"
    assert segment.recognized_at is not None
    assert segment.retry_count == 1  # 保留重试次数


def test_audio_segment_cascade_delete_with_episode(db_session):
    """测试删除 Episode 时级联删除 AudioSegment"""
    from app.models import Episode, AudioSegment
    
    # 创建 Episode 和 Segments
    episode = Episode(
        title="Cascade Delete Test",
        file_hash="cascade_test_001",
        duration=600.0
    )
    db_session.add(episode)
    db_session.commit()
    
    segment1 = AudioSegment(
        episode_id=episode.id,
        segment_index=0,
        segment_id="segment_001",
        segment_path=None,
        start_time=0.0,
        end_time=180.0,
        duration=180.0,
        status="pending"
    )
    segment2 = AudioSegment(
        episode_id=episode.id,
        segment_index=1,
        segment_id="segment_002",
        segment_path=None,
        start_time=180.0,
        end_time=360.0,
        duration=180.0,
        status="pending"
    )
    db_session.add_all([segment1, segment2])
    db_session.commit()
    
    episode_id = episode.id
    
    # 删除 Episode
    db_session.delete(episode)
    db_session.commit()
    
    # 验证 AudioSegment 被级联删除
    segments = db_session.query(AudioSegment).filter(
        AudioSegment.episode_id == episode_id
    ).all()
    assert len(segments) == 0


def test_audio_segment_unique_constraint(db_session):
    """测试 AudioSegment 的唯一性约束（同一 Episode 的 segment_index 不能重复）"""
    from app.models import Episode, AudioSegment
    from sqlalchemy.exc import IntegrityError
    
    # 创建 Episode
    episode = Episode(
        title="Unique Constraint Test",
        file_hash="unique_test_001",
        duration=600.0
    )
    db_session.add(episode)
    db_session.commit()
    
    # 创建第一个 Segment
    segment1 = AudioSegment(
        episode_id=episode.id,
        segment_index=0,
        segment_id="segment_001",
        segment_path=None,
        start_time=0.0,
        end_time=180.0,
        duration=180.0,
        status="pending"
    )
    db_session.add(segment1)
    db_session.commit()
    
    # 尝试创建相同 segment_index 的 Segment（应该失败）
    segment2 = AudioSegment(
        episode_id=episode.id,
        segment_index=0,  # 相同的 segment_index
        segment_id="segment_001_duplicate",
        segment_path=None,
        start_time=0.0,
        end_time=180.0,
        duration=180.0,
        status="pending"
    )
    db_session.add(segment2)
    
    # 验证：提交时会抛出 IntegrityError
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_audio_segment_virtual_segmentation(db_session):
    """测试虚拟分段（segment_path 为 NULL）"""
    from app.models import Episode, AudioSegment
    
    # 创建 Episode
    episode = Episode(
        title="Virtual Segment Test",
        file_hash="virtual_test_001",
        duration=600.0
    )
    db_session.add(episode)
    db_session.commit()
    
    # 创建虚拟分段（segment_path 为 NULL）
    segment = AudioSegment(
        episode_id=episode.id,
        segment_index=0,
        segment_id="segment_001",
        segment_path=None,  # ⭐ 虚拟分段，不存储物理文件
        start_time=0.0,
        end_time=180.0,
        duration=180.0,
        status="pending"
    )
    db_session.add(segment)
    db_session.commit()
    
    # 验证：segment_path 为 NULL
    assert segment.segment_path is None
    # 验证：时间范围正确
    assert segment.start_time == 0.0
    assert segment.end_time == 180.0
    assert segment.duration == 180.0


def test_audio_segment_string_representation(db_session):
    """测试 AudioSegment 的字符串表示"""
    from app.models import Episode, AudioSegment
    
    # 创建 Episode 和 Segment
    episode = Episode(
        title="Repr Test Episode",
        file_hash="repr_test_001",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    segment = AudioSegment(
        episode_id=episode.id,
        segment_index=0,
        segment_id="segment_001",
        segment_path=None,
        start_time=0.0,
        end_time=180.0,
        duration=180.0,
        status="pending"
    )
    db_session.add(segment)
    db_session.commit()
    
    # 验证字符串表示
    assert str(segment) is not None
    assert repr(segment) is not None
    assert "AudioSegment" in repr(segment)
    assert f"id={segment.id}" in repr(segment)


