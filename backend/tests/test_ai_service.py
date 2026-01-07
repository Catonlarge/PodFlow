"""
AI 服务测试用例

测试 AI 查询服务的核心功能，包括：
- API key 验证 (Gemini & Moonshot)
- 统一查询接口路由
- JSON 响应解析
- 类型检测
- 上下文构建
- 错误处理
"""
import pytest
import json
import os
from unittest.mock import Mock, patch, MagicMock
from app.services.ai_service import AIService
from app.config import GEMINI_API_KEY, MOONSHOT_API_KEY


# ==================== API Key 验证与初始化测试 ====================

def test_ai_service_initialization_mock_mode():
    """测试 Mock 模式初始化"""
    with patch('app.services.ai_service.USE_AI_MOCK', True):
        service = AIService()
        assert service.use_mock is True
        # Mock 模式下不强制要求 client 初始化
        assert service.gemini_client is None or service.moonshot_client is None

@patch('app.services.ai_service.genai.Client')
@patch('app.services.ai_service.OpenAI')
def test_ai_service_initialization_with_keys(mock_openai, mock_genai):
    """测试 API key 存在时的初始化"""
    # 模拟两个 Key 都存在
    with patch('app.services.ai_service.GEMINI_API_KEY', 'fake_gemini_key'), \
         patch('app.services.ai_service.MOONSHOT_API_KEY', 'fake_moonshot_key'), \
         patch('app.services.ai_service.USE_AI_MOCK', False):
        
        service = AIService()
        assert service.gemini_client is not None
        assert service.moonshot_client is not None
        mock_genai.assert_called_once()
        mock_openai.assert_called_once()

def test_ai_service_initialization_no_keys():
    """测试没有 Key 时的降级处理"""
    with patch('app.services.ai_service.GEMINI_API_KEY', ''), \
         patch('app.services.ai_service.MOONSHOT_API_KEY', ''), \
         patch('app.services.ai_service.USE_AI_MOCK', False):
        
        service = AIService()
        assert service.gemini_client is None
        assert service.moonshot_client is None
        # 不应抛出异常，而是只打印警告（根据新逻辑）

# ==================== 统一查询接口测试 (Moonshot / Kimi) ====================

@patch('app.services.ai_service.OpenAI')
def test_query_route_to_moonshot(mock_openai_class):
    """测试查询路由到 Moonshot"""
    # Arrange
    mock_response = Mock()
    mock_response.choices = [Mock(message=Mock(content=json.dumps({
        "type": "word",
        "content": {"phonetic": "/test/", "definition": "测试", "explanation": "Kimi解释"}
    })))]
    
    mock_client = Mock()
    mock_client.chat.completions.create.return_value = mock_response
    mock_openai_class.return_value = mock_client
    
    with patch('app.services.ai_service.MOONSHOT_API_KEY', 'sk-test'):
        service = AIService()
        # Act
        result = service.query("test", provider="kimi-k2-turbo-preview")
        
        # Assert
        assert result["type"] == "word"
        assert result["content"]["explanation"] == "Kimi解释"
        
        # 验证调用了 OpenAI 接口而不是 Gemini
        mock_client.chat.completions.create.assert_called_once()
        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["model"] == "kimi-k2-turbo-preview"
        assert len(call_kwargs["messages"]) == 2  # system + user

# ==================== 统一查询接口测试 (Gemini) ====================

@patch('app.services.ai_service.genai.Client')
def test_query_route_to_gemini(mock_genai_class):
    """测试查询路由到 Gemini"""
    # Arrange
    mock_response = Mock()
    mock_response.text = json.dumps({
        "type": "phrase",
        "content": {"phonetic": "/test/", "definition": "测试", "explanation": "Gemini解释"}
    })
    
    mock_client = Mock()
    mock_client.models.generate_content.return_value = mock_response
    mock_genai_class.return_value = mock_client
    
    with patch('app.services.ai_service.GEMINI_API_KEY', 'fake_key'):
        service = AIService()
        # Act
        result = service.query("test phrase", provider="gemini-2.5-flash")
        
        # Assert
        assert result["type"] == "phrase"
        assert result["content"]["explanation"] == "Gemini解释"
        
        # 验证调用了 Gemini 接口
        mock_client.models.generate_content.assert_called_once()

# ==================== 默认 Provider 测试 ====================

@patch('app.services.ai_service.OpenAI')
def test_query_uses_default_provider(mock_openai_class):
    """测试未指定 provider 时使用配置的默认值 (Kimi)"""
    mock_response = Mock()
    mock_response.choices = [Mock(message=Mock(content=json.dumps({
        "type": "word",
        "content": {"definition": "Default"}
    })))]
    mock_client = Mock()
    mock_client.chat.completions.create.return_value = mock_response
    mock_openai_class.return_value = mock_client

    with patch('app.services.ai_service.MOONSHOT_API_KEY', 'sk-test'), \
         patch('app.services.ai_service.AI_MODEL_NAME', 'kimi-k2-turbo-preview'):
        
        service = AIService()
        service.query("default test")
        
        # 验证是否使用了默认 provider
        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["model"] == "kimi-k2-turbo-preview"

# ==================== JSON 响应解析测试 (通用) ====================

@patch('app.services.ai_service.OpenAI')
def test_parse_json_response_with_markdown(mock_openai_class):
    """测试解析带 Markdown 代码块的响应 (Kimi 常返回这种格式)"""
    json_str = json.dumps({"type": "word", "content": {"definition": "Markdown Test"}})
    markdown_content = f"```json\n{json_str}\n```"
    
    mock_response = Mock()
    mock_response.choices = [Mock(message=Mock(content=markdown_content))]
    mock_client = Mock()
    mock_client.chat.completions.create.return_value = mock_response
    mock_openai_class.return_value = mock_client

    with patch('app.services.ai_service.MOONSHOT_API_KEY', 'sk-test'):
        service = AIService()
        result = service.query("test", provider="kimi-k2-turbo-preview")
        
        assert result["content"]["definition"] == "Markdown Test"

# ==================== 错误处理测试 ====================

@patch('app.services.ai_service.OpenAI')
def test_missing_key_error(mock_openai_class):
    """测试指定了 provider 但没有 Key 的情况"""
    # 模拟只有 Gemini Key，没有 Moonshot Key
    with patch('app.services.ai_service.GEMINI_API_KEY', 'fake'), \
         patch('app.services.ai_service.MOONSHOT_API_KEY', ''):
        
        service = AIService()
        # 尝试调用 Moonshot
        with pytest.raises(ValueError, match="Moonshot API Key 未配置"):
            service.query("test", provider="kimi-k2-turbo-preview")

@patch('app.services.ai_service.OpenAI')
def test_invalid_provider_error(mock_openai_class):
    """测试不支持的 Provider"""
    with patch('app.services.ai_service.MOONSHOT_API_KEY', 'sk-test'):
        service = AIService()
        with pytest.raises(ValueError, match="不支持的 AI 提供商"):
            service.query("test", provider="unknown-provider")

# ==================== 上下文构建测试 ====================

@patch('app.services.ai_service.OpenAI')
def test_context_in_moonshot_prompt(mock_openai_class):
    """测试上下文是否正确插入 Moonshot 提示词"""
    mock_response = Mock()
    mock_response.choices = [Mock(message=Mock(content=json.dumps({"type":"word", "content":{}})))]
    mock_client = Mock()
    mock_client.chat.completions.create.return_value = mock_response
    mock_openai_class.return_value = mock_client

    with patch('app.services.ai_service.MOONSHOT_API_KEY', 'sk-test'):
        service = AIService()
        context = "Previous sentence."
        service.query("Current word", context=context, provider="kimi-k2-turbo-preview")
        
        # 验证 user message 中包含上下文
        call_kwargs = mock_client.chat.completions.create.call_args[1]
        messages = call_kwargs["messages"]
        user_content = next(m["content"] for m in messages if m["role"] == "user")
        
        assert "上下文" in user_content
        assert context in user_content
        assert "Current word" in user_content