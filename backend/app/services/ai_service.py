"""
AI 查询服务 (通用重构版)

提供统一的 AI 查询接口，支持自动判断查询类型（word/phrase/sentence）。
支持:
1. Google Gemini 原生接口
2. OpenAI 兼容接口 (Kimi, DeepSeek, GPT-4, etc.)
"""
import json
import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from typing import Optional, Dict

# Google GenAI SDK
from google import genai
# OpenAI SDK (通用兼容客户端)
from openai import OpenAI

# 引入统一配置
from app.config import (
    AI_PROVIDER_TYPE,
    AI_MODEL_NAME,
    AI_API_KEY,
    AI_BASE_URL,
    AI_QUERY_TIMEOUT, 
    USE_AI_MOCK
)

logger = logging.getLogger(__name__)

class AIService:
    """
    AI 查询服务类
    
    提供统一的查询接口，AI 自动判断查询类型（word/phrase/sentence）。
    后端已解耦，通过 .env 配置决定使用 Gemini 还是 OpenAI 兼容接口。
    """
    
    def __init__(self):
        """
        初始化 AI 服务
        根据 .env 配置初始化对应的客户端。
        """
        self.use_mock = USE_AI_MOCK
        self.client = None
        self.provider_type = AI_PROVIDER_TYPE
        
        if self.use_mock:
            logger.info("AIService initialized with MOCK mode (no API key required)")
            return

        if not AI_API_KEY:
            logger.warning("AIService: AI_API_KEY not found. Services will default to MOCK or fail.")
            return

        try:
            # === 初始化逻辑分支 ===
            if self.provider_type == "gemini":
                # Google 原生模式
                self.client = genai.Client(api_key=AI_API_KEY)
                logger.info(f"AIService: Initialized Gemini Client (Model: {AI_MODEL_NAME})")
                
            else:
                # OpenAI 兼容模式 (默认)
                # 适用于: Kimi, DeepSeek, OpenAI, Yi, Qwen 等
                self.client = OpenAI(
                    api_key=AI_API_KEY,
                    base_url=AI_BASE_URL
                )
                logger.info(f"AIService: Initialized OpenAI-Compatible Client (URL: {AI_BASE_URL}, Model: {AI_MODEL_NAME})")
                
        except Exception as e:
            logger.error(f"AIService: Client initialization failed: {e}")

    def _create_fallback_response(self, text: str, context: Optional[str], raw_response: str) -> Dict:
        """
        兜底响应：当 AI 返回格式不正确时，自动推断类型并构建默认响应

        Args:
            text: 用户查询的文本
            context: 上下文（可选）
            raw_response: AI 原始响应（用于日志）

        Returns:
            dict: 符合格式的响应对象
        """
        text_trimmed = text.strip()
        word_count = len(text_trimmed.split())

        # 根据文本特征自动判断类型
        if word_count <= 1:
            query_type = "word"
            fallback_data = {
                "type": "word",
                "content": {
                    "phonetic": f"/{text_trimmed.lower()}/",
                    "definition": f"{text_trimmed}（AI 响应格式错误，使用默认释义）",
                    "explanation": f"这是 '{text_trimmed}' 的默认解释。由于 AI 响应格式不稳定，系统自动生成了此兜底内容。"
                }
            }
        elif word_count <= 5:
            query_type = "phrase"
            fallback_data = {
                "type": "phrase",
                "content": {
                    "phonetic": "",
                    "definition": f"{text_trimmed}（AI 响应格式错误，使用默认释义）",
                    "explanation": f"这是短语 '{text_trimmed}' 的默认解释。由于 AI 响应格式不稳定，系统自动生成了此兜底内容。"
                }
            }
        else:
            query_type = "sentence"
            fallback_data = {
                "type": "sentence",
                "content": {
                    "translation": f"这是句子 '{text_trimmed[:50]}...' 的默认翻译（AI 响应格式错误）。",
                    "highlight_vocabulary": []
                }
            }

        logger.warning(f"Created fallback response for {query_type}: {text[:30]}...")
        return fallback_data

    def _mock_query(self, text: str, context: Optional[str] = None) -> Dict:
        """
        Mock 查询方法：返回模拟的 AI 响应数据（用于调试）
        """
        text_trimmed = text.strip()
        word_count = len(text_trimmed.split())
        
        # 简单判断类型：根据文本长度和单词数量
        if word_count <= 1:
            query_type = "word"
            mock_data = {
                "type": "word",
                "content": {
                    "phonetic": f"/{text_trimmed.lower()}/",
                    "definition": f"{text_trimmed} 的中文释义（Mock数据）",
                    "explanation": f"这是关于 '{text_trimmed}' 的示例解释。在 Mock 模式下，这是模拟数据。"
                }
            }
        elif word_count <= 5:
            query_type = "phrase"
            mock_data = {
                "type": "phrase",
                "content": {
                    "phonetic": f"/{text_trimmed.lower().replace(' ', ' ')}/",
                    "definition": f"{text_trimmed} 的中文释义（Mock数据）",
                    "explanation": f"这是关于短语 '{text_trimmed}' 的示例解释。在 Mock 模式下，这是模拟数据。"
                }
            }
        else:
            query_type = "sentence"
            mock_data = {
                "type": "sentence",
                "content": {
                    "translation": f"这是句子 '{text_trimmed}' 的中文翻译（Mock数据）。",
                    "highlight_vocabulary": [
                        {"term": "example", "definition": "示例"}
                    ]
                }
            }
        
        logger.info(f"Mock AI 查询: type={query_type}, text={text[:30]}...")
        return mock_data

    def query(self, text: str, context: Optional[str] = None, provider: Optional[str] = None) -> Dict:
        """
        统一查询接口：传入划线文本，AI 自动判断是 word/phrase/sentence
        
        Args:
            text: 用户划线的文本
            context: 上下文（可选）
            provider: (保留参数以兼容旧代码) 如果传入，在日志中记录，实际使用 .env 配置的模型
        
        Returns:
            dict: 解析后的 JSON 对象
        """
        if self.use_mock:
            return self._mock_query(text, context)
            
        if not self.client:
            raise ValueError("AI Client not initialized. Please check your .env configuration.")

        # 3. 构建提示词 (Prompt) - 完整保留您的 Prompt
        system_prompt = """# Role
你是一名专业的英语语言教学助手，擅长以简洁、准确的方式向英语学习者解释语言知识。

# Task
接收用户的输入内容，首先判断其属于"词汇 (word)"、"短语 (phrase)"还是"句子 (sentence)"，然后按照指定的 JSON 格式输出教学内容。

# Constraints
1. 输出必须严格遵守 JSON 格式，不要包含Markdown代码块标记（如 ```json）。直接输出 JSON 字符串。
2. 解释内容需简洁明了，适合英语学习者，总字数控制在 300 字以内。
3. 如果是专业术语，必须在解释中包含背景知识。
4. 你必须用中文回答。

# Output Format (JSON)
{
    "type": "word | phrase | sentence",
    "content": {
        // 如果是 word 或 phrase：
        "phonetic": "...", 
        "definition": "...", 
        "explanation": "...", 
        
        // 如果是 sentence：
        "translation": "...", 
        "highlight_vocabulary": [
            {"term": "...", "definition": "..."}
        ]
    }
}"""

        if context:
            user_prompt = f"上下文：{context}\n\n查询内容：{text}"
        else:
            user_prompt = text

        try:
            response_text = ""
            executor = ThreadPoolExecutor(max_workers=1)
            
            def call_ai():
                # 使用配置中的模型，忽略传入的 provider 参数以保持统一，或仅作为日志记录
                target_model = AI_MODEL_NAME
                
                # === 调用逻辑分支 ===
                if self.provider_type == "gemini":
                    # Gemini 原生调用
                    logger.debug(f"Calling Gemini ({target_model}) for text: {text[:20]}...")
                    full_prompt = f"{system_prompt}\n\nUser Query:\n{user_prompt}"
                    resp = self.client.models.generate_content(
                        model=target_model,
                        contents=full_prompt
                    )
                    return resp.text
                else:
                    # OpenAI 兼容调用 (Kimi/DeepSeek/GPT)
                    logger.debug(f"Calling OpenAI/Kimi ({target_model}) for text: {text[:20]}...")
                    completion = self.client.chat.completions.create(
                        model=target_model,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        temperature=0.3, # 保持低随机性
                    )
                    return completion.choices[0].message.content

            # 执行并等待
            try:
                future = executor.submit(call_ai)
                response_text = future.result(timeout=AI_QUERY_TIMEOUT)
            except FutureTimeoutError:
                logger.error(f"AI 查询超时: 超过 {AI_QUERY_TIMEOUT} 秒")
                raise TimeoutError("AI Request Timed Out")
            finally:
                executor.shutdown(wait=False)

            if not response_text:
                raise ValueError("AI Response is empty")

            # 5. JSON 解析逻辑 (完整保留)
            response_text = response_text.strip()
            if response_text.startswith("```json"): response_text = response_text[7:]
            if response_text.startswith("```"): response_text = response_text[3:]
            if response_text.endswith("```"): response_text = response_text[:-3]
            response_text = response_text.strip()
            
            try:
                result = json.loads(response_text)
            except json.JSONDecodeError as e:
                logger.error(f"JSON Parsing Failed: {e}. Content: {response_text[:200]}")
                # 使用兜底逻辑
                result = self._create_fallback_response(text, context, response_text)
                logger.warning(f"Using fallback response: type={result.get('type')}")
                return result

            # 兜底逻辑：如果 AI 返回的 JSON 缺少 type 或 content，自动推断
            if "type" not in result or "content" not in result:
                logger.warning(f"AI response missing 'type' or 'content', using fallback. Original: {result}")
                result = self._create_fallback_response(text, context, response_text)
                logger.warning(f"Using fallback response: type={result.get('type')}")

            return result

        except Exception as e:
            logger.error(f"AI Query Failed: {e}", exc_info=True)
            raise e