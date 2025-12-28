"""
AI 服务测试用例

测试 AI 查询服务的核心功能，包括：
- API key 验证
- 统一查询接口
- JSON 响应解析
- 类型检测
- 上下文构建
- 错误处理
- 查询缓存（集成测试）
"""
import pytest
import json
from unittest.mock import Mock, patch, MagicMock
from app.services.ai_service import AIService
from app.config import GEMINI_API_KEY, DEFAULT_AI_PROVIDER


# ==================== API Key 验证测试 ====================

def test_ai_service_initialization_with_valid_key():
    """测试 AI 服务初始化（API key 存在）"""
    service = AIService()
    assert service is not None
    assert service.client is not None
    assert service.model_name == 'gemini-2.5-flash'


def test_ai_service_initialization_without_key():
    """测试 AI 服务初始化（API key 不存在）"""
    with patch('app.services.ai_service.GEMINI_API_KEY', ''):
        with pytest.raises(ValueError, match="GEMINI_API_KEY"):
            AIService()


# ==================== 统一查询接口测试 ====================

def test_query_method_signature():
    """测试 query 方法签名"""
    service = AIService()
    assert hasattr(service, 'query')
    assert callable(service.query)


@patch('app.services.ai_service.genai.Client')
def test_query_without_context(mock_client_class):
    """测试 query 方法（无上下文）"""
    # Mock 响应
    mock_response = Mock()
    mock_response.text = json.dumps({
        "type": "word",
        "content": {
            "phonetic": "/test/",
            "definition": "测试",
            "explanation": "这是一个测试"
        }
    })
    
    mock_client = Mock()
    mock_client.models.generate_content.return_value = mock_response
    mock_client_class.return_value = mock_client
    
    service = AIService()
    result = service.query("test")
    
    assert result["type"] == "word"
    assert "content" in result
    assert "phonetic" in result["content"]
    
    # 验证 prompt 构建（无上下文）
    call_kwargs = mock_client.models.generate_content.call_args[1]
    assert "test" in call_kwargs["contents"]
    assert "上下文" not in call_kwargs["contents"]


@patch('app.services.ai_service.genai.Client')
def test_query_with_context(mock_client_class):
    """测试 query 方法（有上下文）"""
    # Mock 响应
    mock_response = Mock()
    mock_response.text = json.dumps({
        "type": "word",
        "content": {
            "phonetic": "/test/",
            "definition": "测试",
            "explanation": "这是一个测试"
        }
    })
    
    mock_client = Mock()
    mock_client.models.generate_content.return_value = mock_response
    mock_client_class.return_value = mock_client
    
    service = AIService()
    result = service.query("test", context="This is a test context.")
    
    assert result["type"] == "word"
    
    # 验证 prompt 构建（有上下文）
    call_kwargs = mock_client.models.generate_content.call_args[1]
    assert "上下文" in call_kwargs["contents"]
    assert "This is a test context." in call_kwargs["contents"]
    assert "test" in call_kwargs["contents"]


# ==================== JSON 响应解析测试 ====================

@patch('app.services.ai_service.genai.Client')
def test_parse_json_response_normal(mock_client_class):
    """测试正常 JSON 响应解析"""
    mock_response = Mock()
    mock_response.text = json.dumps({
        "type": "word",
        "content": {
            "phonetic": "/test/",
            "definition": "测试",
            "explanation": "这是一个测试"
        }
    })
    
    mock_client = Mock()
    mock_client.models.generate_content.return_value = mock_response
    mock_client_class.return_value = mock_client
    
    service = AIService()
    result = service.query("test")
    
    assert result["type"] == "word"
    assert result["content"]["phonetic"] == "/test/"


@patch('app.services.ai_service.genai.Client')
def test_parse_json_response_with_markdown_code_block(mock_client_class):
    """测试带 Markdown 代码块的响应解析"""
    mock_response = Mock()
    json_content = json.dumps({
        "type": "word",
        "content": {
            "phonetic": "/test/",
            "definition": "测试",
            "explanation": "这是一个测试"
        }
    })
    mock_response.text = f"```json\n{json_content}\n```"
    
    mock_client = Mock()
    mock_client.models.generate_content.return_value = mock_response
    mock_client_class.return_value = mock_client
    
    service = AIService()
    result = service.query("test")
    
    assert result["type"] == "word"
    assert result["content"]["phonetic"] == "/test/"


@patch('app.services.ai_service.genai.Client')
def test_parse_json_response_with_simple_code_block(mock_client_class):
    """测试带简单代码块的响应解析（```）"""
    mock_response = Mock()
    json_content = json.dumps({
        "type": "word",
        "content": {
            "phonetic": "/test/",
            "definition": "测试",
            "explanation": "这是一个测试"
        }
    })
    mock_response.text = f"```\n{json_content}\n```"
    
    mock_client = Mock()
    mock_client.models.generate_content.return_value = mock_response
    mock_client_class.return_value = mock_client
    
    service = AIService()
    result = service.query("test")
    
    assert result["type"] == "word"


@patch('app.services.ai_service.genai.Client')
def test_parse_json_response_invalid_json(mock_client_class):
    """测试无效 JSON 格式的错误处理"""
    mock_response = Mock()
    mock_response.text = "这不是有效的 JSON"
    
    mock_client = Mock()
    mock_client.models.generate_content.return_value = mock_response
    mock_client_class.return_value = mock_client
    
    service = AIService()
    
    with pytest.raises(ValueError, match="不是有效的 JSON"):
        service.query("test")


# ==================== 类型检测测试 ====================

@patch('app.services.ai_service.genai.Client')
def test_query_word_type(mock_client_class):
    """测试 word 类型返回"""
    mock_response = Mock()
    mock_response.text = json.dumps({
        "type": "word",
        "content": {
            "phonetic": "/tækˈsɒnəmi/",
            "definition": "分类学；分类法",
            "explanation": "生物学中用于分类和命名生物体的科学体系。"
        }
    })
    
    mock_client = Mock()
    mock_client.models.generate_content.return_value = mock_response
    mock_client_class.return_value = mock_client
    
    service = AIService()
    result = service.query("taxonomy")
    
    assert result["type"] == "word"
    assert "phonetic" in result["content"]
    assert "definition" in result["content"]
    assert "explanation" in result["content"]


@patch('app.services.ai_service.genai.Client')
def test_query_phrase_type(mock_client_class):
    """测试 phrase 类型返回"""
    mock_response = Mock()
    mock_response.text = json.dumps({
        "type": "phrase",
        "content": {
            "phonetic": "/blæk swɒn ɪˈvent/",
            "definition": "黑天鹅事件",
            "explanation": "金融和经济学术语。指那些极其罕见、难以预测，但一旦发生就会造成极端严重后果的事件。"
        }
    })
    
    mock_client = Mock()
    mock_client.models.generate_content.return_value = mock_response
    mock_client_class.return_value = mock_client
    
    service = AIService()
    result = service.query("Black swan event")
    
    assert result["type"] == "phrase"
    assert "phonetic" in result["content"]
    assert "definition" in result["content"]
    assert "explanation" in result["content"]


@patch('app.services.ai_service.genai.Client')
def test_query_sentence_type(mock_client_class):
    """测试 sentence 类型返回"""
    mock_response = Mock()
    mock_response.text = json.dumps({
        "type": "sentence",
        "content": {
            "translation": "资本的积累是投资的先决条件。",
            "highlight_vocabulary": [
                {"term": "accumulation", "definition": "积累；堆积"},
                {"term": "prerequisite", "definition": "先决条件；前提"},
                {"term": "investment", "definition": "投资"}
            ]
        }
    })
    
    mock_client = Mock()
    mock_client.models.generate_content.return_value = mock_response
    mock_client_class.return_value = mock_client
    
    service = AIService()
    result = service.query("The accumulation of capital is a prerequisite for investment.")
    
    assert result["type"] == "sentence"
    assert "translation" in result["content"]
    assert "highlight_vocabulary" in result["content"]
    assert isinstance(result["content"]["highlight_vocabulary"], list)


# ==================== 格式验证测试 ====================

@patch('app.services.ai_service.genai.Client')
def test_query_missing_type_field(mock_client_class):
    """测试缺少 type 字段的错误处理"""
    mock_response = Mock()
    mock_response.text = json.dumps({
        "content": {
            "phonetic": "/test/",
            "definition": "测试"
        }
    })
    
    mock_client = Mock()
    mock_client.models.generate_content.return_value = mock_response
    mock_client_class.return_value = mock_client
    
    service = AIService()
    
    with pytest.raises(ValueError, match="缺少 type 或 content 字段"):
        service.query("test")


@patch('app.services.ai_service.genai.Client')
def test_query_missing_content_field(mock_client_class):
    """测试缺少 content 字段的错误处理"""
    mock_response = Mock()
    mock_response.text = json.dumps({
        "type": "word"
    })
    
    mock_client = Mock()
    mock_client.models.generate_content.return_value = mock_response
    mock_client_class.return_value = mock_client
    
    service = AIService()
    
    with pytest.raises(ValueError, match="缺少 type 或 content 字段"):
        service.query("test")


@patch('app.services.ai_service.genai.Client')
def test_query_invalid_type_value(mock_client_class):
    """测试无效 type 值的错误处理"""
    mock_response = Mock()
    mock_response.text = json.dumps({
        "type": "invalid_type",
        "content": {
            "phonetic": "/test/",
            "definition": "测试"
        }
    })
    
    mock_client = Mock()
    mock_client.models.generate_content.return_value = mock_response
    mock_client_class.return_value = mock_client
    
    service = AIService()
    
    with pytest.raises(ValueError, match="type 字段值无效"):
        service.query("test")


# ==================== 上下文构建测试 ====================

@patch('app.services.ai_service.genai.Client')
def test_context_text_in_prompt(mock_client_class):
    """测试上下文文本是否正确包含在 prompt 中"""
    mock_response = Mock()
    mock_response.text = json.dumps({
        "type": "word",
        "content": {
            "phonetic": "/test/",
            "definition": "测试",
            "explanation": "这是一个测试"
        }
    })
    
    mock_client = Mock()
    mock_client.models.generate_content.return_value = mock_response
    mock_client_class.return_value = mock_client
    
    service = AIService()
    context = "This is the previous sentence. This is the next sentence."
    service.query("test", context=context)
    
    # 验证 prompt 包含上下文
    call_kwargs = mock_client.models.generate_content.call_args[1]
    assert "上下文" in call_kwargs["contents"]
    assert context in call_kwargs["contents"]
    assert "查询内容" in call_kwargs["contents"]
    assert "test" in call_kwargs["contents"]


# ==================== 错误处理测试 ====================

@patch('app.services.ai_service.genai.Client')
def test_api_timeout_error(mock_client_class):
    """测试 API 超时错误处理"""
    mock_client = Mock()
    mock_client.models.generate_content.side_effect = Exception("API timeout")
    mock_client_class.return_value = mock_client
    
    service = AIService()
    
    with pytest.raises(Exception, match="API timeout"):
        service.query("test")


@patch('app.services.ai_service.genai.Client')
def test_network_error(mock_client_class):
    """测试网络错误处理"""
    mock_client = Mock()
    mock_client.models.generate_content.side_effect = ConnectionError("Network error")
    mock_client_class.return_value = mock_client
    
    service = AIService()
    
    with pytest.raises(Exception, match="Network error"):
        service.query("test")


# ==================== 真实 API 调用测试（集成测试）====================

@pytest.mark.integration
def test_real_api_call_with_valid_key():
    """测试真实 API 调用（验证 API key 有效性）"""
    if not GEMINI_API_KEY:
        pytest.skip("GEMINI_API_KEY not set")
    
    service = AIService()
    result = service.query("hello")
    
    # 验证返回格式
    assert "type" in result
    assert "content" in result
    assert result["type"] in ["word", "phrase", "sentence"]
    
    # 验证内容结构
    if result["type"] in ["word", "phrase"]:
        assert "phonetic" in result["content"]
        assert "definition" in result["content"]
        assert "explanation" in result["content"]
    elif result["type"] == "sentence":
        assert "translation" in result["content"]
        assert "highlight_vocabulary" in result["content"]

