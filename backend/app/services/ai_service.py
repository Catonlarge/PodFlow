"""
AI 查询服务

提供统一的 AI 查询接口，支持自动判断查询类型（word/phrase/sentence）。
当前实现使用 Google Gemini API。
"""
import json
import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from google import genai
from typing import Optional, Dict

from app.config import GEMINI_API_KEY, DEFAULT_AI_PROVIDER, AI_QUERY_TIMEOUT

logger = logging.getLogger(__name__)


class AIService:
    """
    AI 查询服务类
    
    提供统一的查询接口，AI 自动判断查询类型（word/phrase/sentence）。
    使用 Google Gemini API 作为后端。
    """
    
    def __init__(self):
        """
        初始化 AI 服务
        
        Raises:
            ValueError: 如果 GEMINI_API_KEY 未设置
        """
        if not GEMINI_API_KEY:
            raise ValueError(
                "GEMINI_API_KEY environment variable is required. "
                "Please set it in .env file or system environment variables."
            )
        
        # 使用新的 Google GenAI SDK API
        self.client = genai.Client(api_key=GEMINI_API_KEY)
        self.model_name = 'gemini-2.5-flash'
        logger.info("AIService initialized with Gemini API")
    
    def query(self, text: str, context: Optional[str] = None, provider: Optional[str] = None) -> Dict:
        """
        统一查询接口：传入划线文本，AI 自动判断是 word/phrase/sentence
        
        Args:
            text: 用户划线的文本
            context: 相邻 2-3 个 TranscriptCue 的文本（可选，用于专有名词识别）
            provider: AI 提供商（默认从 config.DEFAULT_AI_PROVIDER 获取，当前仅支持 Gemini）
        
        Returns:
            dict: 解析后的 JSON 对象，格式为：
            {
                "type": "word" | "phrase" | "sentence",
                "content": {
                    # word/phrase: {phonetic, definition, explanation}
                    # sentence: {translation, highlight_vocabulary}
                }
            }
        
        Raises:
            ValueError: JSON 解析失败或格式不符合规范
            Exception: API 调用失败
        """
        # 构建系统提示词
        system_prompt = """# Role
你是一名专业的英语语言教学助手，擅长以简洁、准确的方式向英语学习者解释语言知识。

# Task
接收用户的输入内容，首先判断其属于"词汇 (word)"、"短语 (phrase)"还是"句子 (sentence)"，然后按照指定的 JSON 格式输出教学内容。

# Constraints
1. 输出必须严格遵守 JSON 格式，不要包含Markdown代码块标记（如 ```json）。
2. 解释内容需简洁明了，适合英语学习者，总字数控制在 100 字以内。
3. 如果是专业术语，必须在解释中包含背景知识。

# Output Format (JSON)
{
    "type": "word | phrase | sentence", // 判断结果
    "content": {
        // 如果是 word 或 phrase，包含以下字段：
        "phonetic": "...", // 音标
        "definition": "...", // 中文释义
        "explanation": "...", // 详细解释/用法/背景知识
        
        // 如果是 sentence，包含以下字段：
        "translation": "...", // 整句中文翻译
        "highlight_vocabulary": [ // 难点词汇解析列表
            {"term": "...", "definition": "..."}
        ]
    }
}

# Few-Shot Examples

## Example 1: Word (词汇)
User Input: "Serendipity"
Assistant Output:
{
    "type": "word",
    "content": {
        "phonetic": "/ˌserənˈdɪpəti/",
        "definition": "意外发现珍宝的运气；机缘凑巧",
        "explanation": "这是一个非常优美的单词，指无意中发现有趣或有价值事物的能力。常用于描述那些美好的、意料之外的巧合或发现。"
    }
}

## Example 2: Phrase (短语)
User Input: "Black swan event"
Assistant Output:
{
    "type": "phrase",
    "content": {
        "phonetic": "/blæk swɒn ɪˈvent/",
        "definition": "黑天鹅事件",
        "explanation": "金融和经济学术语。指那些极其罕见、难以预测，但一旦发生就会造成极端严重后果的事件。背景源于人们原以为天鹅都是白的，直到发现黑天鹅。"
    }
}

## Example 3: Sentence (句子)
User Input: "The accumulation of capital is a prerequisite for investment."
Assistant Output:
{
    "type": "sentence",
    "content": {
        "translation": "资本的积累是投资的先决条件。",
        "highlight_vocabulary": [
            {"term": "accumulation", "definition": "积累；堆积"},
            {"term": "prerequisite", "definition": "先决条件；前提"},
            {"term": "investment", "definition": "投资"}
        ]
    }
}"""
        
        # 构建用户提示词
        if context:
            user_prompt = f"上下文：{context}\n\n查询内容：{text}"
        else:
            user_prompt = text
        
        # 组合完整提示词
        full_prompt = f"{system_prompt}\n\n{user_prompt}"
        
        try:
            # 调用 Gemini API（带超时控制）
            logger.debug(f"Calling Gemini API with text: {text[:50]}... (timeout={AI_QUERY_TIMEOUT}s)")
            
            # 使用线程池执行同步 API 调用，并设置超时
            executor = ThreadPoolExecutor(max_workers=1)
            try:
                future = executor.submit(
                    self.client.models.generate_content,
                    model=self.model_name,
                    contents=full_prompt
                )
                # 设置超时
                response = future.result(timeout=AI_QUERY_TIMEOUT)
            except FutureTimeoutError:
                logger.error(f"AI 查询超时: 超过 {AI_QUERY_TIMEOUT} 秒未返回结果")
                raise TimeoutError(f"AI 查询超时：超过 {AI_QUERY_TIMEOUT} 秒未返回结果，请稍后重试")
            finally:
                executor.shutdown(wait=False)
            
            if not response.text:
                raise ValueError("AI 返回的响应为空")
            
            # 解析 JSON（Gemini 可能返回带 Markdown 代码块的格式）
            response_text = response.text.strip()
            
            # 移除 Markdown 代码块标记
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.startswith("```"):
                response_text = response_text[3:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            response_text = response_text.strip()
            
            # 解析 JSON
            try:
                result = json.loads(response_text)
            except json.JSONDecodeError as e:
                logger.error(f"JSON 解析失败: {e}\n响应内容: {response_text[:200]}")
                raise ValueError(f"AI 返回的内容不是有效的 JSON：{e}") from e
            
            # 验证格式
            if "type" not in result or "content" not in result:
                logger.error(f"JSON 格式不符合规范: {result}")
                raise ValueError("AI 返回的 JSON 格式不符合规范：缺少 type 或 content 字段")
            
            if result["type"] not in ["word", "phrase", "sentence"]:
                logger.error(f"无效的 type 值: {result['type']}")
                raise ValueError(f"AI 返回的 type 字段值无效：{result['type']}")
            
            logger.info(f"AI 查询成功: type={result['type']}, text={text[:30]}...")
            return result
            
        except TimeoutError:
            # 超时错误
            logger.error(f"AI 查询超时: 超过 {AI_QUERY_TIMEOUT} 秒未返回结果")
            raise TimeoutError(f"AI 查询超时：超过 {AI_QUERY_TIMEOUT} 秒未返回结果，请稍后重试")
        except ValueError:
            # 重新抛出 ValueError（格式错误）
            raise
        except Exception as e:
            # 捕获其他异常（API 调用失败、网络错误等）
            logger.error(f"AI API 调用失败: {e}", exc_info=True)
            raise Exception(f"AI 查询失败：{str(e)}") from e

