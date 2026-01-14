"""
AI 服务测试用例

测试 AI 查询服务的核心功能，包括：
- API key 验证
- 统一查询接口路由
- JSON 响应解析
- 类型检测
- 上下文构建
- 错误处理
- 兜底逻辑 (Fallback)
"""
import pytest
import json
import os
from unittest.mock import Mock, patch, MagicMock
from app.services.ai_service import AIService
from app.config import AI_API_KEY, AI_PROVIDER_TYPE


# ==================== API Key 验证与初始化测试 ====================

def test_ai_service_initialization_mock_mode():
    """测试 Mock 模式初始化"""
    with patch('app.services.ai_service.USE_AI_MOCK', True):
        service = AIService()
        assert service.use_mock is True
        assert service.client is None

@patch('app.services.ai_service.OpenAI')
def test_ai_service_initialization_with_key(mock_openai):
    """测试 API key 存在时的初始化 (OpenAI 兼容模式)"""
    with patch('app.services.ai_service.AI_API_KEY', 'sk-test-key'), \
         patch('app.services.ai_service.USE_AI_MOCK', False), \
         patch('app.services.ai_service.AI_PROVIDER_TYPE', 'openai'):

        service = AIService()
        assert service.client is not None
        assert service.provider_type == "openai"
        mock_openai.assert_called_once()

def test_ai_service_initialization_no_keys():
    """测试没有 Key 时的降级处理"""
    with patch('app.services.ai_service.AI_API_KEY', ''), \
         patch('app.services.ai_service.USE_AI_MOCK', False):

        service = AIService()
        assert service.client is None
        # 不应抛出异常，而是只打印警告

# ==================== 兜底逻辑测试 ====================

def test_create_fallback_response_for_word():
    """测试单词类型的兜底响应"""
    service = AIService()
    result = service._create_fallback_response("serendipity", None, "")

    assert result["type"] == "word"
    assert "phonetic" in result["content"]
    assert "definition" in result["content"]
    assert "explanation" in result["content"]
    assert "AI 响应格式错误" in result["content"]["definition"]

def test_create_fallback_response_for_phrase():
    """测试短语类型的兜底响应"""
    service = AIService()
    result = service._create_fallback_response("look forward to", None, "")

    assert result["type"] == "phrase"
    assert "definition" in result["content"]
    assert "explanation" in result["content"]
    assert "AI 响应格式错误" in result["content"]["definition"]

def test_create_fallback_response_for_sentence():
    """测试句子类型的兜底响应"""
    service = AIService()
    result = service._create_fallback_response("This is a long sentence with many words.", None, "")

    assert result["type"] == "sentence"
    assert "translation" in result["content"]
    assert "highlight_vocabulary" in result["content"]
    assert "AI 响应格式错误" in result["content"]["translation"]

# ==================== OpenAI 兼容接口测试 ====================

@patch('app.services.ai_service.OpenAI')
def test_query_with_openai_provider(mock_openai_class):
    """测试使用 OpenAI 兼容接口查询"""
    mock_response = Mock()
    mock_response.choices = [Mock(message=Mock(content=json.dumps({
        "type": "word",
        "content": {"phonetic": "/test/", "definition": "测试", "explanation": "AI解释"}
    })))]

    mock_client = Mock()
    mock_client.chat.completions.create.return_value = mock_response
    mock_openai_class.return_value = mock_client

    with patch('app.services.ai_service.AI_API_KEY', 'sk-test'), \
         patch('app.services.ai_service.AI_PROVIDER_TYPE', 'openai'):

        service = AIService()
        result = service.query("test")

        assert result["type"] == "word"
        assert result["content"]["explanation"] == "AI解释"
        mock_client.chat.completions.create.assert_called_once()

# ==================== 兜底逻辑集成测试 ====================

@patch('app.services.ai_service.OpenAI')
def test_query_with_missing_type_field_uses_fallback(mock_openai_class):
    """测试 AI 响应缺少 type 字段时使用兜底逻辑"""
    # 返回缺少 type 字段的不完整响应
    mock_response = Mock()
    mock_response.choices = [Mock(message=Mock(content=json.dumps({
        "content": {"definition": "测试"}
    })))]

    mock_client = Mock()
    mock_client.chat.completions.create.return_value = mock_response
    mock_openai_class.return_value = mock_client

    with patch('app.services.ai_service.AI_API_KEY', 'sk-test'), \
         patch('app.services.ai_service.AI_PROVIDER_TYPE', 'openai'):

        service = AIService()
        result = service.query("test")

        # 应该返回兜底响应
        assert result["type"] == "word"
        assert "AI 响应格式错误" in result["content"]["definition"]

@patch('app.services.ai_service.OpenAI')
def test_query_with_missing_content_field_uses_fallback(mock_openai_class):
    """测试 AI 响应缺少 content 字段时使用兜底逻辑"""
    # 返回缺少 content 字段的不完整响应
    mock_response = Mock()
    mock_response.choices = [Mock(message=Mock(content=json.dumps({
        "type": "word"
    })))]

    mock_client = Mock()
    mock_client.chat.completions.create.return_value = mock_response
    mock_openai_class.return_value = mock_client

    with patch('app.services.ai_service.AI_API_KEY', 'sk-test'), \
         patch('app.services.ai_service.AI_PROVIDER_TYPE', 'openai'):

        service = AIService()
        result = service.query("test phrase")

        # 应该返回兜底响应
        assert result["type"] == "phrase"
        assert "AI 响应格式错误" in result["content"]["definition"]

@patch('app.services.ai_service.OpenAI')
def test_query_with_invalid_json_uses_fallback(mock_openai_class):
    """测试 AI 返回无效 JSON 时使用兜底逻辑"""
    # 返回无效的 JSON
    mock_response = Mock()
    mock_response.choices = [Mock(message=Mock(content="这不是有效的JSON内容"))]

    mock_client = Mock()
    mock_client.chat.completions.create.return_value = mock_response
    mock_openai_class.return_value = mock_client

    with patch('app.services.ai_service.AI_API_KEY', 'sk-test'), \
         patch('app.services.ai_service.AI_PROVIDER_TYPE', 'openai'):

        service = AIService()
        result = service.query("serendipity")

        # 应该返回兜底响应 (单个单词)
        assert result["type"] == "word"
        assert "AI 响应格式错误" in result["content"]["definition"]

# ==================== JSON 响应解析测试 ====================

@patch('app.services.ai_service.OpenAI')
def test_parse_json_response_with_markdown(mock_openai_class):
    """测试解析带 Markdown 代码块的响应"""
    json_str = json.dumps({"type": "word", "content": {"definition": "Markdown Test"}})
    markdown_content = f"```json\n{json_str}\n```"

    mock_response = Mock()
    mock_response.choices = [Mock(message=Mock(content=markdown_content))]
    mock_client = Mock()
    mock_client.chat.completions.create.return_value = mock_response
    mock_openai_class.return_value = mock_client

    with patch('app.services.ai_service.AI_API_KEY', 'sk-test'), \
         patch('app.services.ai_service.AI_PROVIDER_TYPE', 'openai'):

        service = AIService()
        result = service.query("test")

        assert result["content"]["definition"] == "Markdown Test"

# ==================== 错误处理测试 ====================

def test_query_without_client_raises_error():
    """测试没有 client 时抛出异常"""
    with patch('app.services.ai_service.AI_API_KEY', ''), \
         patch('app.services.ai_service.USE_AI_MOCK', False):

        service = AIService()
        with pytest.raises(ValueError, match="AI Client not initialized"):
            service.query("test")

# ==================== 上下文构建测试 ====================

@patch('app.services.ai_service.OpenAI')
def test_context_in_prompt(mock_openai_class):
    """测试上下文是否正确插入提示词"""
    mock_response = Mock()
    mock_response.choices = [Mock(message=Mock(content=json.dumps({"type":"word", "content":{}})))]
    mock_client = Mock()
    mock_client.chat.completions.create.return_value = mock_response
    mock_openai_class.return_value = mock_client

    with patch('app.services.ai_service.AI_API_KEY', 'sk-test'), \
         patch('app.services.ai_service.AI_PROVIDER_TYPE', 'openai'):

        service = AIService()
        context = "Previous sentence."
        service.query("Current word", context=context)

        # 验证 user message 中包含上下文
        call_kwargs = mock_client.chat.completions.create.call_args[1]
        messages = call_kwargs["messages"]
        user_content = next(m["content"] for m in messages if m["role"] == "user")

        assert "上下文" in user_content
        assert context in user_content
        assert "Current word" in user_content