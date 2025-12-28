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
        language="en-US",
        transcription_status="pending"
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
        language="en-US",
        transcription_status="pending"
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
        language="zh-CN",  # 中文音频
        transcription_status="pending"
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
        language="en-US",
        transcription_status="pending"
    )
    db_session.add(episode1)
    db_session.commit()
    
    # 尝试创建相同 file_hash 的 Episode（应该失败）
    episode2 = Episode(
        title="Episode 2 (Duplicate)",
        file_hash="same_hash_123",  # 相同的 hash
        duration=300.0,
        language="en-US",
        transcription_status="pending"
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
        duration=120.0,  # 2 分钟
        transcription_status="pending"
    )
    db_session.add(short_episode)
    
    # 长音频（> 180s）
    long_episode = Episode(
        title="Long Episode",
        file_hash="long001",
        duration=600.0,  # 10 分钟
        transcription_status="pending"
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
            duration=duration,
            transcription_status="pending"
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
    """测试转录时间戳属性（从 AudioSegment 动态计算）"""
    from app.models import Episode, AudioSegment
    from datetime import datetime, timedelta
    
    # 创建 Episode
    episode = Episode(
        title="Timestamp Test",
        file_hash="timestamp001",
        duration=300.0,
        transcription_status="pending"
    )
    db_session.add(episode)
    db_session.commit()
    
    # 验证：没有 Segment 时，时间戳为 None
    assert episode.transcription_started_at is None
    assert episode.transcription_completed_at is None
    
    # 创建 AudioSegment（模拟转录开始）
    now = datetime.utcnow()
    segment1 = AudioSegment(
        episode_id=episode.id,
        segment_index=0,
        segment_id="segment_001",
        segment_path=None,
        start_time=0.0,
        end_time=180.0,
        status="processing",
        transcription_started_at=now
    )
    db_session.add(segment1)
    db_session.commit()
    
    # 刷新 Episode（重新加载关联）
    db_session.refresh(episode)
    
    # 验证：started_at 自动计算（来自第一个 Segment）
    assert episode.transcription_started_at is not None
    assert episode.transcription_started_at == now
    
    # 验证：转录未完成时，completed_at 为 None
    assert episode.transcription_completed_at is None
    
    # 模拟第一个 Segment 转录完成
    segment1.status = "completed"
    segment1.recognized_at = now + timedelta(seconds=10)
    db_session.commit()
    db_session.refresh(episode)
    
    # 验证：只有一个 Segment 完成时，completed_at 就有值了
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
        language="en-US",
        transcription_status="pending"
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
        status="pending"
    )
    segment2 = AudioSegment(
        episode_id=episode.id,
        segment_index=1,
        segment_id="segment_002",
        segment_path=None,
        start_time=180.0,
        end_time=360.0,
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
        status="pending"
    )
    segment2 = AudioSegment(
        episode_id=episode.id,
        segment_index=1,
        segment_id="segment_002",
        segment_path=None,
        start_time=180.0,
        end_time=360.0,
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
        segment_path=None,  # 虚拟分段，不存储物理文件
        start_time=0.0,
        end_time=180.0,
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
        status="pending"
    )
    db_session.add(segment)
    db_session.commit()
    
    # 验证字符串表示
    assert str(segment) is not None
    assert repr(segment) is not None
    assert "AudioSegment" in repr(segment)
    assert f"id={segment.id}" in repr(segment)


def test_audio_segment_duration_property(db_session):
    """测试 AudioSegment 的 duration 属性（动态计算）"""
    from app.models import Episode, AudioSegment
    
    # 创建 Episode
    episode = Episode(
        title="Duration Property Test",
        file_hash="duration_prop_001",
        duration=600.0
    )
    db_session.add(episode)
    db_session.commit()
    
    # 创建 Segment（不同的时间范围）
    segment1 = AudioSegment(
        episode_id=episode.id,
        segment_index=0,
        segment_id="segment_001",
        segment_path=None,
        start_time=0.0,
        end_time=180.0,  # 180 秒
        status="pending"
    )
    segment2 = AudioSegment(
        episode_id=episode.id,
        segment_index=1,
        segment_id="segment_002",
        segment_path=None,
        start_time=180.0,
        end_time=360.0,  # 180 秒
        status="pending"
    )
    segment3 = AudioSegment(
        episode_id=episode.id,
        segment_index=2,
        segment_id="segment_003",
        segment_path=None,
        start_time=360.0,
        end_time=420.0,  # 60 秒（最后一段）
        status="pending"
    )
    db_session.add_all([segment1, segment2, segment3])
    db_session.commit()
    
    # 验证 duration 属性（动态计算）
    assert segment1.duration == 180.0  # 180 - 0 = 180
    assert segment2.duration == 180.0  # 360 - 180 = 180
    assert segment3.duration == 60.0   # 420 - 360 = 60
    
    # 修改 end_time，验证 duration 自动更新（数据一致性）
    segment1.end_time = 200.0
    assert segment1.duration == 200.0  # 200 - 0 = 200（自动正确）
    
    # 验证：duration 不是存储字段，而是计算属性
    # 不能直接赋值
    try:
        segment1.duration = 999.0
        assert False, "不应该能够直接设置 duration 属性"
    except AttributeError:
        pass  # 预期行为：不能设置只读属性


def test_episode_transcription_timestamps_short_audio(db_session):
    """测试短音频（单 segment）的转录时间戳"""
    from app.models import Episode, AudioSegment
    from datetime import datetime, timedelta
    
    # 创建短音频 Episode（120 秒，小于分段阈值 180 秒）
    episode = Episode(
        title="Short Audio",
        file_hash="short_audio_001",
        duration=120.0  # 120 秒，不需要分段
    )
    db_session.add(episode)
    db_session.commit()
    
    # 验证：短音频也需要创建一个 AudioSegment
    assert episode.needs_segmentation is False
    assert episode.total_segments == 1
    
    # 验证：没有 Segment 时，时间戳为 None
    assert episode.transcription_started_at is None
    assert episode.transcription_completed_at is None
    
    # 创建单个 AudioSegment（短音频的完整分段）
    now = datetime.utcnow()
    segment = AudioSegment(
        episode_id=episode.id,
        segment_index=0,
        segment_id="segment_001",
        segment_path=None,
        start_time=0.0,
        end_time=120.0,
        status="processing",
        transcription_started_at=now
    )
    db_session.add(segment)
    db_session.commit()
    db_session.refresh(episode)
    
    # 验证：started_at 自动计算
    assert episode.transcription_started_at == now
    
    # 验证：转录未完成时，completed_at 为 None
    assert episode.transcription_completed_at is None
    
    # 模拟转录完成
    segment.status = "completed"
    segment.recognized_at = now + timedelta(seconds=5)
    db_session.commit()
    db_session.refresh(episode)
    
    # 验证：短音频只有一个 Segment，完成后 completed_at 立即有值
    assert episode.transcription_completed_at is not None
    assert episode.transcription_completed_at == segment.recognized_at
    assert episode.transcription_completed_at >= episode.transcription_started_at


def test_episode_transcription_timestamps_partial_completion(db_session):
    """测试长音频（多 segments）部分完成的转录时间戳"""
    from app.models import Episode, AudioSegment
    from datetime import datetime, timedelta
    
    # 创建长音频 Episode（600 秒，需要分段）
    episode = Episode(
        title="Long Audio",
        file_hash="long_audio_001",
        duration=600.0  # 600 秒，需要分段为 4 段（180 * 3 + 60）
    )
    db_session.add(episode)
    db_session.commit()
    
    # 验证：长音频需要分段
    assert episode.needs_segmentation is True
    assert episode.total_segments == 4
    
    # 创建 4 个 AudioSegment
    now = datetime.utcnow()
    segments = []
    for i in range(4):
        start = i * 180
        end = min((i + 1) * 180, 600)
        segment = AudioSegment(
            episode_id=episode.id,
            segment_index=i,
            segment_id=f"segment_{i+1:03d}",
            segment_path=None,
            start_time=start,
            end_time=end,
            status="pending"
        )
        segments.append(segment)
        db_session.add(segment)
    db_session.commit()
    db_session.refresh(episode)
    
    # 验证：所有 Segment 都是 pending 时，时间戳为 None
    assert episode.transcription_started_at is None
    assert episode.transcription_completed_at is None
    
    # 场景 1：第一个 Segment 开始转录（异步，segment_001 先开始）
    segments[0].status = "processing"
    segments[0].transcription_started_at = now
    db_session.commit()
    db_session.refresh(episode)
    
    # 验证：started_at 有值了（第一个开始转录的 Segment）
    assert episode.transcription_started_at == now
    
    # 验证：转录未完成时，completed_at 仍为 None
    assert episode.transcription_completed_at is None
    
    # 场景 2：第三个 Segment 先完成了（异步完成，乱序）
    segments[2].status = "processing"
    segments[2].transcription_started_at = now + timedelta(seconds=5)
    segments[2].status = "completed"
    segments[2].recognized_at = now + timedelta(seconds=10)
    db_session.commit()
    db_session.refresh(episode)
    
    # 验证：started_at 更新为最早的时间（segment_001 的时间）
    assert episode.transcription_started_at == now  # 仍然是 segment_001 的时间
    
    # 验证：不是所有 Segment 都完成，completed_at 仍为 None
    assert episode.transcription_completed_at is None
    
    # 场景 3：第一个 Segment 完成
    segments[0].status = "completed"
    segments[0].recognized_at = now + timedelta(seconds=15)
    db_session.commit()
    db_session.refresh(episode)
    
    # 验证：completed_at 仍为 None（还有 2 个未完成）
    assert episode.transcription_completed_at is None
    
    # 场景 4：第二个 Segment 开始并完成
    segments[1].status = "processing"
    segments[1].transcription_started_at = now + timedelta(seconds=3)
    segments[1].status = "completed"
    segments[1].recognized_at = now + timedelta(seconds=20)
    db_session.commit()
    db_session.refresh(episode)
    
    # 验证：completed_at 仍为 None（还有 1 个未完成）
    assert episode.transcription_completed_at is None
    
    # 场景 5：最后一个 Segment 完成
    segments[3].status = "processing"
    segments[3].transcription_started_at = now + timedelta(seconds=8)
    segments[3].status = "completed"
    segments[3].recognized_at = now + timedelta(seconds=25)
    db_session.commit()
    db_session.refresh(episode)
    
    # 验证：所有 Segment 完成后，completed_at 有值了（最后完成的时间）
    assert episode.transcription_completed_at is not None
    assert episode.transcription_completed_at == segments[3].recognized_at  # 最后完成的是 segment_004
    assert episode.transcription_completed_at >= episode.transcription_started_at


def test_episode_transcription_timestamps_with_failed_segment(db_session):
    """测试包含失败 Segment 的转录时间戳"""
    from app.models import Episode, AudioSegment
    from datetime import datetime, timedelta
    
    # 创建 Episode
    episode = Episode(
        title="Audio with Failed Segment",
        file_hash="failed_segment_001",
        duration=360.0  # 360 秒，2 段
    )
    db_session.add(episode)
    db_session.commit()
    
    # 创建 2 个 AudioSegment
    now = datetime.utcnow()
    segment1 = AudioSegment(
        episode_id=episode.id,
        segment_index=0,
        segment_id="segment_001",
        segment_path=None,
        start_time=0.0,
        end_time=180.0,
        status="processing",
        transcription_started_at=now
    )
    segment2 = AudioSegment(
        episode_id=episode.id,
        segment_index=1,
        segment_id="segment_002",
        segment_path=None,
        start_time=180.0,
        end_time=360.0,
        status="processing",
        transcription_started_at=now + timedelta(seconds=2)
    )
    db_session.add_all([segment1, segment2])
    db_session.commit()
    db_session.refresh(episode)
    
    # 场景：第一个 Segment 失败，第二个 Segment 完成
    segment1.status = "failed"
    segment1.error_message = "Transcription API error"
    segment2.status = "completed"
    segment2.recognized_at = now + timedelta(seconds=10)
    db_session.commit()
    db_session.refresh(episode)
    
    # 验证：有失败的 Segment，completed_at 仍为 None
    assert episode.transcription_completed_at is None
    
    # 场景：重试第一个 Segment 并成功
    segment1.status = "processing"
    segment1.transcription_started_at = now + timedelta(seconds=15)
    segment1.retry_count = 1
    segment1.status = "completed"
    segment1.recognized_at = now + timedelta(seconds=20)
    segment1.error_message = None
    db_session.commit()
    db_session.refresh(episode)
    
    # 验证：所有 Segment 完成后，completed_at 有值了
    assert episode.transcription_completed_at is not None
    assert episode.transcription_completed_at == segment1.recognized_at  # 最后完成的是 segment_001（重试后）


# ==================== TranscriptCue 模型测试 ====================

def test_transcript_cue_model_creation(db_session):
    """测试 TranscriptCue 模型的基本创建"""
    from app.models import Episode, AudioSegment, TranscriptCue
    
    # 创建 Episode
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_001",
        duration=600.0,
        transcription_status="pending"
    )
    db_session.add(episode)
    db_session.commit()
    
    # 创建 AudioSegment
    segment = AudioSegment(
        episode_id=episode.id,
        segment_index=0,
        segment_id="segment_001",
        segment_path=None,
        start_time=0.0,
        end_time=180.0,
        status="completed"
    )
    db_session.add(segment)
    db_session.commit()
    
    # 创建 TranscriptCue
    cue = TranscriptCue(
        episode_id=episode.id,
        segment_id=segment.id,
        start_time=0.28,
        end_time=2.22,
        speaker="Lenny",
        text="Thank you so much for being here."
    )
    db_session.add(cue)
    db_session.commit()
    
    # 验证：基本属性
    assert cue.id is not None
    assert cue.episode_id == episode.id
    assert cue.segment_id == segment.id
    assert cue.start_time == 0.28
    assert cue.end_time == 2.22
    assert cue.speaker == "Lenny"
    assert cue.text == "Thank you so much for being here."
    assert cue.created_at is not None


def test_transcript_cue_relationship_with_episode(db_session):
    """测试 TranscriptCue 与 Episode 的关系"""
    from app.models import Episode, TranscriptCue
    
    # 创建 Episode
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_002",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    # 创建多个 TranscriptCue
    cue1 = TranscriptCue(
        episode_id=episode.id,
        segment_id=None,  # 手动导入的字幕
        start_time=0.5,
        end_time=2.0,
        speaker="Speaker 1",
        text="First sentence."
    )
    cue2 = TranscriptCue(
        episode_id=episode.id,
        segment_id=None,
        start_time=2.5,
        end_time=4.0,
        speaker="Speaker 2",
        text="Second sentence."
    )
    db_session.add_all([cue1, cue2])
    db_session.commit()
    
    # 验证：Episode 可以访问其 cues
    db_session.refresh(episode)
    assert len(episode.transcript_cues) == 2
    assert episode.transcript_cues[0].text == "First sentence."
    assert episode.transcript_cues[1].text == "Second sentence."


def test_transcript_cue_relationship_with_segment(db_session):
    """测试 TranscriptCue 与 AudioSegment 的关系"""
    from app.models import Episode, AudioSegment, TranscriptCue
    
    # 创建 Episode 和 Segment
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_003",
        duration=600.0
    )
    db_session.add(episode)
    db_session.commit()  # 先提交 Episode 以获取 ID
    
    segment = AudioSegment(
        episode_id=episode.id,
        segment_index=0,
        segment_id="segment_001",
        segment_path=None,
        start_time=0.0,
        end_time=180.0,
        status="completed"
    )
    db_session.add(segment)
    db_session.commit()
    
    # 创建属于该 Segment 的 Cue
    cue1 = TranscriptCue(
        episode_id=episode.id,
        segment_id=segment.id,
        start_time=0.5,
        end_time=2.0,
        text="Cue from segment 001"
    )
    cue2 = TranscriptCue(
        episode_id=episode.id,
        segment_id=segment.id,
        start_time=2.5,
        end_time=4.0,
        text="Another cue from segment 001"
    )
    db_session.add_all([cue1, cue2])
    db_session.commit()
    
    # 验证：Segment 可以访问其 cues
    db_session.refresh(segment)
    assert len(segment.transcript_cues) == 2
    # 验证：按 start_time 排序
    sorted_cues = sorted(segment.transcript_cues, key=lambda c: c.start_time)
    assert sorted_cues[0].start_time == 0.5
    assert sorted_cues[1].start_time == 2.5


def test_transcript_cue_cascade_delete_with_episode(db_session):
    """测试删除 Episode 时级联删除 TranscriptCue"""
    from app.models import Episode, TranscriptCue
    
    # 创建 Episode 和 Cue
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_004",
        duration=300.0,
        transcription_status="pending"
    )
    db_session.add(episode)
    db_session.commit()
    
    cue = TranscriptCue(
        episode_id=episode.id,
        segment_id=None,
        start_time=0.5,
        end_time=2.0,
        text="Test cue"
    )
    db_session.add(cue)
    db_session.commit()
    
    cue_id = cue.id
    
    # 删除 Episode（应该级联删除 Cue）
    db_session.delete(episode)
    db_session.commit()
    
    # 验证：Cue 也被删除了
    deleted_cue = db_session.query(TranscriptCue).filter_by(id=cue_id).first()
    assert deleted_cue is None


def test_transcript_cue_cascade_delete_with_segment(db_session):
    """测试删除 AudioSegment 时，TranscriptCue 被级联删除（CASCADE）"""
    from app.models import Episode, AudioSegment, TranscriptCue
    
    # 创建 Episode、Segment 和 Cue
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_005",
        duration=600.0,
        transcription_status="processing"
    )
    db_session.add(episode)
    db_session.commit()  # 先提交 Episode 以获取 ID
    
    segment = AudioSegment(
        episode_id=episode.id,
        segment_index=0,
        segment_id="segment_001",
        segment_path=None,
        start_time=0.0,
        end_time=180.0,
        status="completed"
    )
    db_session.add(segment)
    db_session.commit()
    
    cue = TranscriptCue(
        episode_id=episode.id,
        segment_id=segment.id,
        start_time=0.5,
        end_time=2.0,
        text="Test cue"
    )
    db_session.add(cue)
    db_session.commit()
    
    cue_id = cue.id
    
    # 删除 Segment（应该级联删除关联的 Cue）
    db_session.delete(segment)
    db_session.commit()
    db_session.expire_all()  # 刷新所有对象状态，确保看到数据库的变更
    
    # 验证：Cue 被级联删除（CASCADE）
    deleted_cue = db_session.query(TranscriptCue).filter(TranscriptCue.id == cue_id).first()
    assert deleted_cue is None, f"Cue should be deleted when Segment is deleted (CASCADE), but cue_id={cue_id} still exists"


def test_transcript_cue_query_by_start_time(db_session):
    """测试按 start_time 查询和排序（替代 cue_index）"""
    from app.models import Episode, TranscriptCue
    
    # 创建 Episode
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_006",
        duration=300.0,
        transcription_status="completed"
    )
    db_session.add(episode)
    db_session.commit()
    
    # 创建多个 Cue（插入顺序不按 start_time）
    cue3 = TranscriptCue(
        episode_id=episode.id,
        start_time=5.0,
        end_time=7.0,
        text="Third cue"
    )
    cue1 = TranscriptCue(
        episode_id=episode.id,
        start_time=0.5,
        end_time=2.0,
        text="First cue"
    )
    cue2 = TranscriptCue(
        episode_id=episode.id,
        start_time=2.5,
        end_time=4.0,
        text="Second cue"
    )
    db_session.add_all([cue3, cue1, cue2])
    db_session.commit()
    
    # 查询：按 start_time 排序
    cues = db_session.query(TranscriptCue).filter(
        TranscriptCue.episode_id == episode.id
    ).order_by(TranscriptCue.start_time).all()
    
    # 验证：顺序正确（按时间排序）
    assert len(cues) == 3
    assert cues[0].start_time == 0.5
    assert cues[1].start_time == 2.5
    assert cues[2].start_time == 5.0
    assert cues[0].text == "First cue"
    assert cues[1].text == "Second cue"
    assert cues[2].text == "Third cue"


def test_transcript_cue_default_speaker(db_session):
    """测试 speaker 字段的默认值"""
    from app.models import Episode, TranscriptCue
    
    # 创建 Episode
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_007",
        duration=300.0,
        transcription_status="pending"
    )
    db_session.add(episode)
    db_session.commit()
    
    # 创建 Cue（不指定 speaker）
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.5,
        end_time=2.0,
        text="Test cue without speaker"
    )
    db_session.add(cue)
    db_session.commit()
    
    # 验证：speaker 默认为 "Unknown"
    assert cue.speaker == "Unknown"


def test_transcript_cue_string_representation(db_session):
    """测试 TranscriptCue 的字符串表示"""
    from app.models import Episode, TranscriptCue
    
    # 创建 Episode 和 Cue
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_008",
        duration=300.0,
        transcription_status="pending"
    )
    db_session.add(episode)
    db_session.commit()
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.5,
        end_time=2.0,
        speaker="Lenny",
        text="This is a very long text that should be truncated in the string representation"
    )
    db_session.add(cue)
    db_session.commit()
    
    # 验证：字符串表示包含关键信息
    cue_repr = repr(cue)
    assert "TranscriptCue" in cue_repr
    assert f"id={cue.id}" in cue_repr
    assert f"episode_id={episode.id}" in cue_repr
    assert f"start_time={cue.start_time:.2f}s" in cue_repr
    assert "speaker='Lenny'" in cue_repr
    # 验证：text 被截断到 30 字符
    assert "..." in cue_repr


def test_episode_transcription_status_physical_field(db_session):
    """测试 Episode.transcription_status 物理字段（用于高效查询）"""
    from app.models import Episode, AudioSegment
    
    # 创建不同状态的 Episode
    episode1 = Episode(
        title="Pending Episode",
        file_hash="status_001",
        duration=300.0,
        transcription_status="pending"
    )
    episode2 = Episode(
        title="Processing Episode",
        file_hash="status_002",
        duration=300.0,
        transcription_status="processing"
    )
    episode3 = Episode(
        title="Completed Episode",
        file_hash="status_003",
        duration=300.0,
        transcription_status="completed"
    )
    db_session.add_all([episode1, episode2, episode3])
    db_session.commit()
    
    # 验证：默认值
    assert episode1.transcription_status == "pending"
    
    # 验证：高效查询（使用索引）
    completed_episodes = db_session.query(Episode).filter(
        Episode.transcription_status == "completed"
    ).all()
    assert len(completed_episodes) == 1
    assert completed_episodes[0].title == "Completed Episode"
    
    # 验证：物理字段与动态属性配合
    segment1 = AudioSegment(
        episode_id=episode2.id,
        segment_index=0,
        segment_id="segment_001",
        start_time=0.0,
        end_time=180.0,
        status="completed"
    )
    segment2 = AudioSegment(
        episode_id=episode2.id,
        segment_index=1,
        segment_id="segment_002",
        start_time=180.0,
        end_time=300.0,
        status="processing"
    )
    db_session.add_all([segment1, segment2])
    db_session.commit()
    
    # 物理字段用于查询
    assert episode2.transcription_status == "processing"
    # 动态属性用于展示
    assert episode2.transcription_progress == 50.0
    assert episode2.transcription_status_display == "正在转录中..."


# ==================== Highlight 模型测试 ====================

def test_highlight_model_creation(db_session):
    """测试 Highlight 模型的基本创建"""
    from app.models import Episode, TranscriptCue, Highlight
    
    # 创建 Episode 和 Cue
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_highlight_001",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()  # 先提交获取 ID
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.5,
        end_time=2.0,
        speaker="Lenny",
        text="Thank you so much for being here."
    )
    db_session.add(cue)
    db_session.commit()
    
    # 创建 Highlight（单 cue 划线）
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=9,  # "Thank you"
        highlighted_text="Thank you",
        highlight_group_id=None,  # 单 cue 划线
        color="#9C27B0"
    )
    db_session.add(highlight)
    db_session.commit()
    
    # 验证：基本属性
    assert highlight.id is not None
    assert highlight.episode_id == episode.id
    assert highlight.cue_id == cue.id
    assert highlight.start_offset == 0
    assert highlight.end_offset == 9
    assert highlight.highlighted_text == "Thank you"
    assert highlight.highlight_group_id is None
    assert highlight.color == "#9C27B0"
    assert highlight.created_at is not None
    assert highlight.updated_at is not None


def test_highlight_color_default_value(db_session):
    """测试 Highlight color 字段的默认值"""
    from app.models import Episode, TranscriptCue, Highlight
    
    # 创建 Episode 和 Cue
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_highlight_002",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()  # 先提交以获取 ID
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.5,
        end_time=2.0,
        text="Test cue"
    )
    db_session.add(cue)
    db_session.commit()
    
    # 创建 Highlight（不指定 color）
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test"
    )
    db_session.add(highlight)
    db_session.commit()
    
    # 验证：color 默认为 #9C27B0（紫色）
    assert highlight.color == "#9C27B0"


def test_highlight_updated_at_auto_update(db_session):
    """测试 Highlight updated_at 字段的自动更新"""
    from app.models import Episode, TranscriptCue, Highlight
    import time
    
    # 创建 Episode 和 Cue
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_highlight_003",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()  # 先提交以获取 ID
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.5,
        end_time=2.0,
        text="Test cue"
    )
    db_session.add(cue)
    db_session.commit()
    
    # 创建 Highlight
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test"
    )
    db_session.add(highlight)
    db_session.commit()
    
    original_updated_at = highlight.updated_at
    
    # 等待一小段时间，然后修改 color
    time.sleep(0.1)
    highlight.color = "#FF5722"  # 改为红色
    db_session.commit()
    
    # 验证：updated_at 已更新
    assert highlight.updated_at > original_updated_at


def test_highlight_single_cue_highlight(db_session):
    """测试单 cue 划线（highlight_group_id = NULL）"""
    from app.models import Episode, TranscriptCue, Highlight
    
    # 创建 Episode 和 Cue
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_highlight_004",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()  # 先提交以获取 ID
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.5,
        end_time=2.0,
        text="This is a test sentence."
    )
    db_session.add(cue)
    db_session.commit()
    
    # 创建单 cue 划线（90% 场景）
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=10,
        end_offset=14,  # "test"
        highlighted_text="test",
        highlight_group_id=None  # 单 cue 划线，无需分组
    )
    db_session.add(highlight)
    db_session.commit()
    
    # 验证：highlight_group_id 为 NULL
    assert highlight.highlight_group_id is None
    assert highlight.highlighted_text == "test"


def test_highlight_cross_cue_with_group(db_session):
    """测试跨 cue 划线（多个 Highlight 共享 highlight_group_id）"""
    from app.models import Episode, TranscriptCue, Highlight
    import uuid
    
    # 创建 Episode 和两个 Cue
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_highlight_005",
        duration=300.0
    )
    db_session.add(episode)

    db_session.commit()  # 先提交以获取 ID
    
    cue1 = TranscriptCue(
        episode_id=episode.id,
        start_time=0.5,
        end_time=2.0,
        text="First sentence."
    )
    cue2 = TranscriptCue(
        episode_id=episode.id,
        start_time=2.5,
        end_time=4.0,
        text="Second sentence."
    )
    db_session.add_all([cue1, cue2])
    db_session.commit()

    db_session.commit()
    
    # 创建跨 cue 划线（10% 场景）
    group_id = str(uuid.uuid4())
    
    highlight1 = Highlight(
        episode_id=episode.id,
        cue_id=cue1.id,
        start_offset=6,  # "sentence."
        end_offset=15,
        highlighted_text="sentence.",
        highlight_group_id=group_id  # 同一组
    )
    highlight2 = Highlight(
        episode_id=episode.id,
        cue_id=cue2.id,
        start_offset=0,  # "Second"
        end_offset=6,
        highlighted_text="Second",
        highlight_group_id=group_id  # 同一组
    )
    db_session.add_all([highlight1, highlight2])
    db_session.commit()
    
    # 验证：两个 Highlight 共享同一个 highlight_group_id
    assert highlight1.highlight_group_id == highlight2.highlight_group_id
    assert highlight1.highlight_group_id == group_id


def test_highlight_delete_by_group(db_session):
    """测试按组删除 Highlight"""
    from app.models import Episode, TranscriptCue, Highlight
    import uuid
    
    # 创建 Episode 和两个 Cue
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_highlight_006",
        duration=300.0
    )
    db_session.add(episode)

    db_session.commit()  # 先提交以获取 ID

    
    cue1 = TranscriptCue(
        episode_id=episode.id,
        start_time=0.5,
        end_time=2.0,
        text="First sentence."
    )
    cue2 = TranscriptCue(
        episode_id=episode.id,
        start_time=2.5,
        end_time=4.0,
        text="Second sentence."
    )
    db_session.add_all([cue1, cue2])

    db_session.commit()
    
    # 创建跨 cue 划线
    group_id = str(uuid.uuid4())
    
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
    db_session.add_all([highlight1, highlight2])
    db_session.commit()
    
    # 保存 ID（删除前）
    highlight1_id = highlight1.id
    highlight2_id = highlight2.id
    
    # 按组删除（模拟删除逻辑）
    db_session.query(Highlight).filter(
        Highlight.highlight_group_id == group_id
    ).delete()
    db_session.commit()
    
    # 验证：两个 Highlight 都被删除了
    assert db_session.query(Highlight).filter_by(id=highlight1_id).first() is None
    assert db_session.query(Highlight).filter_by(id=highlight2_id).first() is None


def test_highlight_relationship_with_episode(db_session):
    """测试 Highlight 与 Episode 的关系"""
    from app.models import Episode, TranscriptCue, Highlight
    
    # 创建 Episode 和 Cue
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_highlight_007",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()  # 先提交以获取 ID
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.5,
        end_time=2.0,
        text="Test cue"
    )
    db_session.add(cue)
    db_session.commit()
    
    # 创建两个 Highlight
    highlight1 = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test"
    )
    highlight2 = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=5,
        end_offset=8,
        highlighted_text="cue"
    )
    db_session.add_all([highlight1, highlight2])
    db_session.commit()
    
    # 验证：Episode 可以访问其 highlights
    db_session.refresh(episode)
    assert len(episode.highlights) == 2


def test_highlight_relationship_with_cue(db_session):
    """测试 Highlight 与 TranscriptCue 的关系"""
    from app.models import Episode, TranscriptCue, Highlight
    
    # 创建 Episode 和 Cue
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_highlight_008",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()  # 先提交以获取 ID
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.5,
        end_time=2.0,
        text="This is a test sentence for highlighting."
    )
    db_session.add(cue)
    db_session.commit()
    
    # 创建多个 Highlight
    highlight1 = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=10,
        end_offset=14,
        highlighted_text="test"
    )
    highlight2 = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=15,
        end_offset=23,
        highlighted_text="sentence"
    )
    db_session.add_all([highlight1, highlight2])
    db_session.commit()
    
    # 验证：Cue 可以访问其 highlights
    db_session.refresh(cue)
    assert len(cue.highlights) == 2
    assert cue.highlights[0].highlighted_text in ["test", "sentence"]


def test_highlight_cascade_delete_with_episode(db_session):
    """测试删除 Episode 时级联删除 Highlight"""
    from app.models import Episode, TranscriptCue, Highlight
    
    # 创建 Episode、Cue 和 Highlight
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_highlight_009",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()  # 先提交以获取 ID
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.5,
        end_time=2.0,
        text="Test cue"
    )
    db_session.add(cue)
    db_session.commit()
    
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test"
    )
    db_session.add(highlight)
    db_session.commit()
    
    highlight_id = highlight.id
    
    # 删除 Episode
    db_session.delete(episode)
    db_session.commit()
    
    # 验证：Highlight 也被删除了（级联删除）
    deleted_highlight = db_session.query(Highlight).filter_by(id=highlight_id).first()
    assert deleted_highlight is None


def test_highlight_cascade_delete_with_cue(db_session):
    """测试删除 TranscriptCue 时级联删除 Highlight"""
    from app.models import Episode, TranscriptCue, Highlight
    
    # 创建 Episode、Cue 和 Highlight
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_highlight_010",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()  # 先提交以获取 ID
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.5,
        end_time=2.0,
        text="Test cue"
    )
    db_session.add(cue)
    db_session.commit()
    
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test"
    )
    db_session.add(highlight)
    db_session.commit()
    
    highlight_id = highlight.id
    
    # 删除 Cue
    db_session.delete(cue)
    db_session.commit()
    
    # 验证：Highlight 也被删除了（级联删除）
    deleted_highlight = db_session.query(Highlight).filter_by(id=highlight_id).first()
    assert deleted_highlight is None


def test_highlight_string_representation(db_session):
    """测试 Highlight 的字符串表示"""
    from app.models import Episode, TranscriptCue, Highlight
    import uuid
    
    # 创建 Episode 和 Cue
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_highlight_011",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()  # 先提交以获取 ID
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.5,
        end_time=2.0,
        text="Test cue"
    )
    db_session.add(cue)
    db_session.commit()
    
    # 测试单 cue 划线（无 group_id）
    highlight1 = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="This is a very long highlighted text that should be truncated"
    )
    db_session.add(highlight1)
    db_session.commit()
    
    highlight1_repr = repr(highlight1)
    assert "Highlight" in highlight1_repr
    assert f"id={highlight1.id}" in highlight1_repr
    assert f"cue_id={cue.id}" in highlight1_repr
    # 验证：text 被截断到 20 字符
    assert "..." in highlight1_repr
    
    # 测试跨 cue 划线（有 group_id）
    group_id = str(uuid.uuid4())
    highlight2 = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test",
        highlight_group_id=group_id
    )
    db_session.add(highlight2)
    db_session.commit()
    
    highlight2_repr = repr(highlight2)
    assert "Highlight" in highlight2_repr
    assert "group=" in highlight2_repr  # 有 group_id 时显示


# ==================== Note Model Tests ====================

def test_note_model_creation(db_session):
    """测试 Note 模型的基本创建"""
    from app.models import Episode, TranscriptCue, Highlight, Note
    
    # 创建测试数据
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_note_001",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.0,
        end_time=5.0,
        text="Test cue text"
    )
    db_session.add(cue)
    db_session.commit()
    
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test"
    )
    db_session.add(highlight)
    db_session.commit()
    
    # 创建 thought 类型的笔记
    note = Note(
        episode_id=episode.id,
        highlight_id=highlight.id,
        content="This is my thought about this highlight.",
        note_type="thought"
    )
    db_session.add(note)
    db_session.commit()
    
    # 验证基本字段
    assert note.id is not None
    assert note.episode_id == episode.id
    assert note.highlight_id == highlight.id
    assert note.content == "This is my thought about this highlight."
    assert note.note_type == "thought"
    assert note.origin_ai_query_id is None
    assert note.created_at is not None
    assert note.updated_at is not None


def test_note_three_types(db_session):
    """测试 Note 的三种类型：underline/thought/ai_card"""
    from app.models import Episode, TranscriptCue, Highlight, Note, AIQueryRecord
    
    # 创建测试数据
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_note_types",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.0,
        end_time=5.0,
        text="Test cue text"
    )
    db_session.add(cue)
    db_session.commit()
    
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test"
    )
    db_session.add(highlight)
    db_session.commit()
    
    # 创建 AI 查询记录（用于 ai_card 类型）
    import json
    response_json = {"type": "word", "content": {"definition": "测试", "explanation": "AI generated explanation"}}
    ai_query = AIQueryRecord(
        highlight_id=highlight.id,
        query_text="test",
        response_text=json.dumps(response_json),
        detected_type="word",
        provider="gemini-2.5-flash",
        status="completed"
    )
    db_session.add(ai_query)
    db_session.commit()
    
    # 1. underline 类型（纯划线，content 为空）
    note_underline = Note(
        episode_id=episode.id,
        highlight_id=highlight.id,
        content=None,  # underline 类型 content 为空
        note_type="underline"
    )
    db_session.add(note_underline)
    
    # 2. thought 类型（用户想法）
    note_thought = Note(
        episode_id=episode.id,
        highlight_id=highlight.id,
        content="My personal thought",
        note_type="thought"
    )
    db_session.add(note_thought)
    
    # 3. ai_card 类型（AI 查询结果）
    note_ai = Note(
        episode_id=episode.id,
        highlight_id=highlight.id,
        content="AI generated explanation",
        note_type="ai_card",
        origin_ai_query_id=ai_query.id  # 使用真实的 AI 查询 ID
    )
    db_session.add(note_ai)
    db_session.commit()
    
    # 验证三种类型
    assert note_underline.note_type == "underline"
    assert note_underline.content is None
    
    assert note_thought.note_type == "thought"
    assert note_thought.content == "My personal thought"
    
    assert note_ai.note_type == "ai_card"
    assert note_ai.content == "AI generated explanation"
    assert note_ai.origin_ai_query_id == ai_query.id
    
    # 验证数据库中有 3 条记录
    assert db_session.query(Note).count() == 3


def test_note_relationship_with_episode(db_session):
    """测试 Note 与 Episode 的关系"""
    from app.models import Episode, TranscriptCue, Highlight, Note
    
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_note_episode",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.0,
        end_time=5.0,
        text="Test cue"
    )
    db_session.add(cue)
    db_session.commit()
    
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test"
    )
    db_session.add(highlight)
    db_session.commit()
    
    # 创建两个笔记
    note1 = Note(
        episode_id=episode.id,
        highlight_id=highlight.id,
        content="Note 1",
        note_type="thought"
    )
    note2 = Note(
        episode_id=episode.id,
        highlight_id=highlight.id,
        content="Note 2",
        note_type="thought"
    )
    db_session.add_all([note1, note2])
    db_session.commit()
    
    # 验证关系
    assert len(episode.notes) == 2
    assert note1 in episode.notes
    assert note2 in episode.notes
    assert note1.episode == episode
    assert note2.episode == episode


def test_note_relationship_with_highlight(db_session):
    """测试 Note 与 Highlight 的关系"""
    from app.models import Episode, TranscriptCue, Highlight, Note
    
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_note_highlight",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.0,
        end_time=5.0,
        text="Test cue"
    )
    db_session.add(cue)
    db_session.commit()
    
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test"
    )
    db_session.add(highlight)
    db_session.commit()
    
    # 创建笔记
    note = Note(
        episode_id=episode.id,
        highlight_id=highlight.id,
        content="My note",
        note_type="thought"
    )
    db_session.add(note)
    db_session.commit()
    
    # 验证关系
    assert len(highlight.notes) == 1
    assert highlight.notes[0] == note
    assert note.highlight == highlight


def test_note_cascade_delete_with_episode(db_session):
    """测试删除 Episode 时级联删除 Note"""
    from app.models import Episode, TranscriptCue, Highlight, Note
    
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_note_cascade_episode",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.0,
        end_time=5.0,
        text="Test cue"
    )
    db_session.add(cue)
    db_session.commit()
    
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test"
    )
    db_session.add(highlight)
    db_session.commit()
    
    note = Note(
        episode_id=episode.id,
        highlight_id=highlight.id,
        content="Test note",
        note_type="thought"
    )
    db_session.add(note)
    db_session.commit()
    
    note_id = note.id
    
    # 删除 Episode
    db_session.delete(episode)
    db_session.commit()
    
    # 验证 Note 也被删除
    assert db_session.query(Note).filter_by(id=note_id).count() == 0


def test_note_cascade_delete_with_highlight(db_session):
    """测试删除 Highlight 时级联删除 Note"""
    from app.models import Episode, TranscriptCue, Highlight, Note
    
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_note_cascade_highlight",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.0,
        end_time=5.0,
        text="Test cue"
    )
    db_session.add(cue)
    db_session.commit()
    
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test"
    )
    db_session.add(highlight)
    db_session.commit()
    
    note = Note(
        episode_id=episode.id,
        highlight_id=highlight.id,
        content="Test note",
        note_type="thought"
    )
    db_session.add(note)
    db_session.commit()
    
    note_id = note.id
    
    # 删除 Highlight
    db_session.delete(highlight)
    db_session.commit()
    
    # 验证 Note 也被删除
    assert db_session.query(Note).filter_by(id=note_id).count() == 0


def test_note_updated_at_auto_update(db_session):
    """测试 Note 的 updated_at 自动更新"""
    from app.models import Episode, TranscriptCue, Highlight, Note
    
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_note_updated",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.0,
        end_time=5.0,
        text="Test cue"
    )
    db_session.add(cue)
    db_session.commit()
    
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test"
    )
    db_session.add(highlight)
    db_session.commit()
    
    note = Note(
        episode_id=episode.id,
        highlight_id=highlight.id,
        content="Original content",
        note_type="thought"
    )
    db_session.add(note)
    db_session.commit()
    
    original_updated_at = note.updated_at
    
    # 稍作延迟
    import time
    time.sleep(0.1)
    
    # 更新内容
    note.content = "Updated content"
    db_session.commit()
    
    # 验证 updated_at 已更新
    assert note.updated_at > original_updated_at


def test_note_content_nullable_for_underline(db_session):
    """测试 underline 类型的 Note 可以有空 content"""
    from app.models import Episode, TranscriptCue, Highlight, Note
    
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_note_nullable",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.0,
        end_time=5.0,
        text="Test cue"
    )
    db_session.add(cue)
    db_session.commit()
    
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test"
    )
    db_session.add(highlight)
    db_session.commit()
    
    # 创建 underline 类型的笔记，content 为 None
    note = Note(
        episode_id=episode.id,
        highlight_id=highlight.id,
        content=None,
        note_type="underline"
    )
    db_session.add(note)
    db_session.commit()
    
    # 验证
    assert note.content is None
    assert note.note_type == "underline"
    
    # 从数据库重新查询验证
    db_session.expire(note)
    db_session.refresh(note)
    assert note.content is None


def test_note_query_by_type(db_session):
    """测试按 note_type 查询笔记"""
    from app.models import Episode, TranscriptCue, Highlight, Note
    
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_note_types",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.0,
        end_time=5.0,
        text="Test cue"
    )
    db_session.add(cue)
    db_session.commit()
    
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test"
    )
    db_session.add(highlight)
    db_session.commit()
    
    # 创建不同类型的笔记
    note1 = Note(episode_id=episode.id, highlight_id=highlight.id, content=None, note_type="underline")
    note2 = Note(episode_id=episode.id, highlight_id=highlight.id, content="Thought 1", note_type="thought")
    note3 = Note(episode_id=episode.id, highlight_id=highlight.id, content="Thought 2", note_type="thought")
    note4 = Note(episode_id=episode.id, highlight_id=highlight.id, content="AI result", note_type="ai_card")
    
    db_session.add_all([note1, note2, note3, note4])
    db_session.commit()
    
    # 查询不同类型的笔记
    underline_notes = db_session.query(Note).filter_by(note_type="underline").all()
    thought_notes = db_session.query(Note).filter_by(note_type="thought").all()
    ai_notes = db_session.query(Note).filter_by(note_type="ai_card").all()
    
    assert len(underline_notes) == 1
    assert len(thought_notes) == 2
    assert len(ai_notes) == 1


def test_note_string_representation(db_session):
    """测试 Note 的字符串表示"""
    from app.models import Episode, TranscriptCue, Highlight, Note
    
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_note_repr",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.0,
        end_time=5.0,
        text="Test cue"
    )
    db_session.add(cue)
    db_session.commit()
    
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test"
    )
    db_session.add(highlight)
    db_session.commit()
    
    # 测试有 content 的笔记
    note_with_content = Note(
        episode_id=episode.id,
        highlight_id=highlight.id,
        content="This is a very long content that should be truncated in repr",
        note_type="thought"
    )
    db_session.add(note_with_content)
    db_session.commit()
    
    note_repr = repr(note_with_content)
    assert "Note" in note_repr
    assert "thought" in note_repr
    assert "content=" in note_repr
    
    # 测试无 content 的笔记（underline）
    note_without_content = Note(
        episode_id=episode.id,
        highlight_id=highlight.id,
        content=None,
        note_type="underline"
    )
    db_session.add(note_without_content)
    db_session.commit()
    
    note_repr2 = repr(note_without_content)
    assert "Note" in note_repr2
    assert "underline" in note_repr2
    assert "content=None" in note_repr2


# ==================== AIQueryRecord Model Tests ====================

def test_ai_query_record_model_creation(db_session):
    """测试 AIQueryRecord 模型的基本创建（⭐ 优化：使用 JSON 格式和 detected_type）"""
    import json
    from app.models import Episode, TranscriptCue, Highlight, AIQueryRecord
    
    # 创建测试数据
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_ai_query_001",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.0,
        end_time=5.0,
        text="This is a taxonomy example"
    )
    db_session.add(cue)
    db_session.commit()
    
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=10,
        end_offset=18,
        highlighted_text="taxonomy"
    )
    db_session.add(highlight)
    db_session.commit()
    
    # 创建 AI 查询记录（Gemini 返回 JSON 格式）
    response_json = {
        "type": "word",
        "content": {
            "phonetic": "/tækˈsɒnəmi/",
            "definition": "分类学；分类法",
            "explanation": "生物学中用于分类和命名生物体的科学体系。"
        }
    }
    
    ai_query = AIQueryRecord(
        highlight_id=highlight.id,
        query_text="taxonomy",
        context_text="This is a taxonomy example. The study of classification.",
        response_text=json.dumps(response_json),  # ⭐ 存储 JSON 字符串
        detected_type="word",  # ⭐ 从 JSON 解析得到的类型
        provider="gemini-2.5-flash",
        status="completed"
    )
    db_session.add(ai_query)
    db_session.commit()
    
    # 验证基本字段
    assert ai_query.id is not None
    assert ai_query.highlight_id == highlight.id
    assert ai_query.query_text == "taxonomy"
    assert ai_query.context_text == "This is a taxonomy example. The study of classification."
    assert ai_query.response_text == json.dumps(response_json)  # ⭐ JSON 字符串
    assert ai_query.detected_type == "word"  # ⭐ 检测到的类型
    assert ai_query.provider == "gemini-2.5-flash"
    assert ai_query.status == "completed"
    assert ai_query.error_message is None
    assert ai_query.created_at is not None
    
    # 验证可以解析 JSON
    parsed_response = json.loads(ai_query.response_text)
    assert parsed_response["type"] == "word"
    assert parsed_response["content"]["definition"] == "分类学；分类法"


def test_ai_query_record_default_status(db_session):
    """测试 AIQueryRecord 的默认状态为 processing（⭐ 优化：移除 query_type）"""
    from app.models import Episode, TranscriptCue, Highlight, AIQueryRecord
    
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_ai_query_status",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.0,
        end_time=5.0,
        text="Test text"
    )
    db_session.add(cue)
    db_session.commit()
    
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test"
    )
    db_session.add(highlight)
    db_session.commit()
    
    # 创建查询记录，不指定 status（处理中状态）
    ai_query = AIQueryRecord(
        highlight_id=highlight.id,
        query_text="test",
        provider="gemini-2.5-flash"
    )
    db_session.add(ai_query)
    db_session.commit()
    
    # 验证默认状态
    assert ai_query.status == "processing"
    assert ai_query.response_text is None
    assert ai_query.detected_type is None  # ⭐ 处理中时 detected_type 为空


def test_ai_query_record_with_error(db_session):
    """测试 AIQueryRecord 的失败场景（带错误信息）（⭐ 优化：移除 query_type）"""
    from app.models import Episode, TranscriptCue, Highlight, AIQueryRecord
    
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_ai_query_error",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.0,
        end_time=5.0,
        text="Test text"
    )
    db_session.add(cue)
    db_session.commit()
    
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test"
    )
    db_session.add(highlight)
    db_session.commit()
    
    # 创建失败的查询记录
    ai_query = AIQueryRecord(
        highlight_id=highlight.id,
        query_text="test",
        provider="gemini-2.5-flash",
        status="failed",
        error_message="API rate limit exceeded"
    )
    db_session.add(ai_query)
    db_session.commit()
    
    # 验证
    assert ai_query.status == "failed"
    assert ai_query.error_message == "API rate limit exceeded"
    assert ai_query.response_text is None
    assert ai_query.detected_type is None  # ⭐ 失败时 detected_type 为空


def test_ai_query_record_relationship_with_highlight(db_session):
    """测试 AIQueryRecord 与 Highlight 的关系（⭐ 优化：移除 query_type，使用 detected_type）"""
    import json
    from app.models import Episode, TranscriptCue, Highlight, AIQueryRecord
    
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_ai_query_highlight",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.0,
        end_time=5.0,
        text="Test text"
    )
    db_session.add(cue)
    db_session.commit()
    
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test"
    )
    db_session.add(highlight)
    db_session.commit()
    
    # 创建两个查询记录（不同 detected_type）
    response_json1 = {"type": "word", "content": {"definition": "测试"}}
    response_json2 = {"type": "phrase", "content": {"definition": "测试短语"}}
    
    ai_query1 = AIQueryRecord(
        highlight_id=highlight.id,
        query_text="test",
        response_text=json.dumps(response_json1),
        detected_type="word",  # ⭐ 从 JSON 解析得到
        provider="gemini-2.5-flash",
        status="completed"
    )
    ai_query2 = AIQueryRecord(
        highlight_id=highlight.id,
        query_text="test phrase",
        response_text=json.dumps(response_json2),
        detected_type="phrase",  # ⭐ 从 JSON 解析得到
        provider="gemini-2.5-flash",
        status="completed"
    )
    db_session.add_all([ai_query1, ai_query2])
    db_session.commit()
    
    # 验证关系
    assert len(highlight.ai_queries) == 2
    assert ai_query1 in highlight.ai_queries
    assert ai_query2 in highlight.ai_queries
    assert ai_query1.highlight == highlight
    assert ai_query2.highlight == highlight
    
    # 验证 detected_type
    assert ai_query1.detected_type == "word"
    assert ai_query2.detected_type == "phrase"


def test_ai_query_record_cascade_delete_with_highlight(db_session):
    """测试删除 Highlight 时级联删除 AIQueryRecord（⭐ 优化：移除 query_type）"""
    from app.models import Episode, TranscriptCue, Highlight, AIQueryRecord
    
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_ai_query_cascade",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.0,
        end_time=5.0,
        text="Test text"
    )
    db_session.add(cue)
    db_session.commit()
    
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test"
    )
    db_session.add(highlight)
    db_session.commit()
    
    ai_query = AIQueryRecord(
        highlight_id=highlight.id,
        query_text="test",
        provider="gemini-2.5-flash",
        status="processing"
    )
    db_session.add(ai_query)
    db_session.commit()
    
    ai_query_id = ai_query.id
    
    # 删除 Highlight
    db_session.delete(highlight)
    db_session.commit()
    
    # 验证 AIQueryRecord 也被删除
    assert db_session.query(AIQueryRecord).filter_by(id=ai_query_id).count() == 0


def test_ai_query_record_cache_logic(db_session):
    """测试 AIQueryRecord 的缓存查询逻辑（⭐ 优化：移除 query_type 依赖）"""
    import json
    from app.models import Episode, TranscriptCue, Highlight, AIQueryRecord
    
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_ai_query_cache",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.0,
        end_time=5.0,
        text="Test text"
    )
    db_session.add(cue)
    db_session.commit()
    
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test"
    )
    db_session.add(highlight)
    db_session.commit()
    
    # 创建已完成的查询记录（缓存）
    response_json = {"type": "word", "content": {"definition": "测试"}}
    ai_query = AIQueryRecord(
        highlight_id=highlight.id,
        query_text="test",
        response_text=json.dumps(response_json),
        detected_type="word",
        provider="gemini-2.5-flash",
        status="completed"
    )
    db_session.add(ai_query)
    db_session.commit()
    
    # 模拟缓存查询逻辑（⭐ 优化：基于 highlight_id，不依赖 query_type）
    existing = db_session.query(AIQueryRecord).filter(
        AIQueryRecord.highlight_id == highlight.id,
        AIQueryRecord.status == "completed"
    ).first()
    
    # 验证缓存命中
    assert existing is not None
    assert existing.status == "completed"
    assert existing.detected_type == "word"
    parsed_response = json.loads(existing.response_text)
    assert parsed_response["type"] == "word"


def test_ai_query_record_different_providers(db_session):
    """测试不同 AI 提供商的查询记录（⭐ 优化：移除 query_type，使用 JSON 格式）"""
    import json
    from app.models import Episode, TranscriptCue, Highlight, AIQueryRecord
    
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_ai_query_providers",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.0,
        end_time=5.0,
        text="Test text"
    )
    db_session.add(cue)
    db_session.commit()
    
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test"
    )
    db_session.add(highlight)
    db_session.commit()
    
    # 创建不同提供商的查询记录
    response_json = {"type": "word", "content": {"definition": "测试"}}
    
    query_gpt35 = AIQueryRecord(
        highlight_id=highlight.id,
        query_text="test",
        response_text=json.dumps(response_json),
        detected_type="word",
        provider="gpt-3.5-turbo",
        status="completed"
    )
    query_gpt4 = AIQueryRecord(
        highlight_id=highlight.id,
        query_text="test",
        response_text=json.dumps(response_json),
        detected_type="word",
        provider="gpt-4",
        status="completed"
    )
    query_claude = AIQueryRecord(
        highlight_id=highlight.id,
        query_text="test",
        response_text=json.dumps(response_json),
        detected_type="word",
        provider="claude-3-sonnet",
        status="completed"
    )
    
    db_session.add_all([query_gpt35, query_gpt4, query_claude])
    db_session.commit()
    
    # 验证可以按提供商查询
    gpt_queries = db_session.query(AIQueryRecord).filter(
        AIQueryRecord.provider.like("gpt%")
    ).all()
    assert len(gpt_queries) == 2
    
    claude_queries = db_session.query(AIQueryRecord).filter_by(
        provider="claude-3-sonnet"
    ).all()
    assert len(claude_queries) == 1


def test_ai_query_record_to_note_conversion(db_session):
    """测试 AIQueryRecord 到 Note 的转化（Critical ⭐ 优化：JSON 格式）"""
    import json
    from app.models import Episode, TranscriptCue, Highlight, AIQueryRecord, Note
    
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_ai_to_note",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.0,
        end_time=5.0,
        text="This is a taxonomy example"
    )
    db_session.add(cue)
    db_session.commit()
    
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=10,
        end_offset=18,
        highlighted_text="taxonomy"
    )
    db_session.add(highlight)
    db_session.commit()
    
    # 1. 用户划线 → AI 查询（Gemini 返回 JSON 格式）
    response_json = {
        "type": "word",
        "content": {
            "phonetic": "/tækˈsɒnəmi/",
            "definition": "分类学；分类法",
            "explanation": "生物学中用于分类和命名生物体的科学体系。"
        }
    }
    
    ai_query = AIQueryRecord(
        highlight_id=highlight.id,
        query_text="taxonomy",
        context_text="This is a taxonomy example.",
        response_text=json.dumps(response_json),  # ⭐ 存储 JSON 字符串
        detected_type="word",  # ⭐ 从 JSON 解析得到
        provider="gemini-2.5-flash",
        status="completed"
    )
    db_session.add(ai_query)
    db_session.commit()
    
    # 2. 用户点击"保存笔记" → 创建 Note
    # Note 的 content 格式化为可读文本（从 JSON 提取）
    note_content = f"{response_json['content']['definition']}\n{response_json['content']['explanation']}"
    
    note = Note(
        episode_id=episode.id,
        highlight_id=highlight.id,
        origin_ai_query_id=ai_query.id,  # 标记来源
        content=note_content,  # ⭐ 格式化的文本内容
        note_type="ai_card"
    )
    db_session.add(note)
    db_session.commit()
    
    # 验证关联
    assert note.origin_ai_query_id == ai_query.id
    assert note.note_type == "ai_card"
    assert note.content == note_content
    assert ai_query.detected_type == "word"  # ⭐ 验证 detected_type
    
    # 3. 删除 AIQueryRecord → Note 保留，origin_ai_query_id 设为 NULL
    ai_query_id = ai_query.id
    db_session.delete(ai_query)
    db_session.commit()
    
    # 刷新 note 对象
    db_session.expire(note)
    db_session.refresh(note)
    
    # 验证 Note 仍存在，但 origin_ai_query_id 被设为 NULL
    assert db_session.query(Note).filter_by(id=note.id).count() == 1
    assert note.origin_ai_query_id is None  # SET NULL 生效
    assert note.content == note_content  # content 保留


def test_ai_query_record_detected_types(db_session):
    """测试不同 detected_type 的 AIQueryRecord（⭐ 优化：使用 detected_type 替代 query_type）"""
    import json
    from app.models import Episode, TranscriptCue, Highlight, AIQueryRecord
    
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_ai_query_types",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.0,
        end_time=5.0,
        text="Test text"
    )
    db_session.add(cue)
    db_session.commit()
    
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test"
    )
    db_session.add(highlight)
    db_session.commit()
    
    # 创建不同类型的查询（AI 自动判断类型）
    response_word = {"type": "word", "content": {"definition": "测试"}}
    response_phrase = {"type": "phrase", "content": {"definition": "测试短语"}}
    response_sentence = {"type": "sentence", "content": {"translation": "这是一个测试句子"}}
    
    query1 = AIQueryRecord(
        highlight_id=highlight.id,
        query_text="test",
        response_text=json.dumps(response_word),
        detected_type="word",  # ⭐ AI 检测到的类型
        provider="gemini-2.5-flash",
        status="completed"
    )
    query2 = AIQueryRecord(
        highlight_id=highlight.id,
        query_text="test phrase",
        response_text=json.dumps(response_phrase),
        detected_type="phrase",  # ⭐ AI 检测到的类型
        provider="gemini-2.5-flash",
        status="completed"
    )
    query3 = AIQueryRecord(
        highlight_id=highlight.id,
        query_text="This is a test sentence.",
        response_text=json.dumps(response_sentence),
        detected_type="sentence",  # ⭐ AI 检测到的类型
        provider="gemini-2.5-flash",
        status="completed"
    )
    
    db_session.add_all([query1, query2, query3])
    db_session.commit()
    
    # 验证 detected_type
    assert query1.detected_type == "word"
    assert query2.detected_type == "phrase"
    assert query3.detected_type == "sentence"
    
    # 按 detected_type 查询
    word_queries = db_session.query(AIQueryRecord).filter_by(
        detected_type="word"
    ).all()
    assert len(word_queries) == 1
    
    phrase_queries = db_session.query(AIQueryRecord).filter_by(
        detected_type="phrase"
    ).all()
    assert len(phrase_queries) == 1
    
    sentence_queries = db_session.query(AIQueryRecord).filter_by(
        detected_type="sentence"
    ).all()
    assert len(sentence_queries) == 1


def test_ai_query_record_string_representation(db_session):
    """测试 AIQueryRecord 的字符串表示（⭐ 优化：使用 detected_type 替代 query_type）"""
    import json
    from app.models import Episode, TranscriptCue, Highlight, AIQueryRecord
    
    episode = Episode(
        title="Test Episode",
        file_hash="test_hash_ai_query_repr",
        duration=300.0
    )
    db_session.add(episode)
    db_session.commit()
    
    cue = TranscriptCue(
        episode_id=episode.id,
        start_time=0.0,
        end_time=5.0,
        text="Test text"
    )
    db_session.add(cue)
    db_session.commit()
    
    highlight = Highlight(
        episode_id=episode.id,
        cue_id=cue.id,
        start_offset=0,
        end_offset=4,
        highlighted_text="Test"
    )
    db_session.add(highlight)
    db_session.commit()
    
    # 短查询文本
    response_json = {"type": "word", "content": {"definition": "测试"}}
    ai_query_short = AIQueryRecord(
        highlight_id=highlight.id,
        query_text="test",
        response_text=json.dumps(response_json),
        detected_type="word",  # ⭐ 使用 detected_type
        provider="gemini-2.5-flash",
        status="completed"
    )
    db_session.add(ai_query_short)
    db_session.commit()
    
    repr_short = repr(ai_query_short)
    assert "AIQueryRecord" in repr_short
    assert "detected_type='word'" in repr_short  # ⭐ 使用 detected_type
    assert "completed" in repr_short
    assert "query='test'" in repr_short
    
    # 长查询文本（会被截断）
    ai_query_long = AIQueryRecord(
        highlight_id=highlight.id,
        query_text="This is a very long query text that should be truncated in repr",
        detected_type="phrase",  # ⭐ 使用 detected_type
        provider="gemini-2.5-flash",
        status="processing"
    )
    db_session.add(ai_query_long)
    db_session.commit()
    
    repr_long = repr(ai_query_long)
    assert "AIQueryRecord" in repr_long
    assert "detected_type='phrase'" in repr_long  # ⭐ 使用 detected_type
    assert "processing" in repr_long
    assert "..." in repr_long  # 截断标记
    
    # 测试 detected_type 为 None 的情况
    ai_query_none = AIQueryRecord(
        highlight_id=highlight.id,
        query_text="test",
        provider="gemini-2.5-flash",
        status="processing"
    )
    db_session.add(ai_query_none)
    db_session.commit()
    
    repr_none = repr(ai_query_none)
    assert "detected_type=None" in repr_none  # ⭐ 处理中时 detected_type 为 None


