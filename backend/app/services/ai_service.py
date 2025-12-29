"""
AI 查询服务

提供统一的 AI 查询接口，支持自动判断查询类型（word/phrase/sentence）。
支持 Google Gemini 和 Moonshot AI (Kimi)。
"""
import json
import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from typing import Optional, Dict

# Google GenAI
from google import genai
# OpenAI SDK (用于 Moonshot/Kimi)
from openai import OpenAI

from app.config import (
    GEMINI_API_KEY, 
    MOONSHOT_API_KEY, 
    DEFAULT_AI_PROVIDER, 
    AI_QUERY_TIMEOUT, 
    USE_AI_MOCK
)

logger = logging.getLogger(__name__)


class AIService:
    """
    AI 查询服务类
    
    提供统一的查询接口，AI 自动判断查询类型（word/phrase/sentence）。
    支持 Google Gemini 和 Moonshot AI (Kimi) 作为后端。
    """
    
    def __init__(self):
        """
        初始化 AI 服务
        
        初始化可用的 AI 客户端。如果未配置 Key，则对应的客户端不可用。
        """
        self.use_mock = USE_AI_MOCK
        self.gemini_client = None
        self.moonshot_client = None
        
        if self.use_mock:
            logger.info("AIService initialized with MOCK mode (no API key required)")
            return

        # 初始化 Gemini 客户端
        if GEMINI_API_KEY:
            try:
                self.gemini_client = genai.Client(api_key=GEMINI_API_KEY)
                logger.info("AIService: Gemini Client initialized")
            except Exception as e:
                logger.warning(f"AIService: Gemini Client initialization failed: {e}")

        # 初始化 Moonshot (Kimi) 客户端
        if MOONSHOT_API_KEY:
            try:
                self.moonshot_client = OpenAI(
                    api_key=MOONSHOT_API_KEY,
                    base_url="https://api.moonshot.cn/v1",
                )
                logger.info("AIService: Moonshot Client initialized")
            except Exception as e:
                logger.warning(f"AIService: Moonshot Client initialization failed: {e}")
        
        if not self.gemini_client and not self.moonshot_client:
            logger.warning("AIService: No AI clients initialized. Only MOCK mode will work.")
    
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
            context: 相邻 2-3 个 TranscriptCue 的文本（可选）
            provider: AI 提供商 (如 'kimi-k2-turbo-preview', 'gemini-2.5-flash')
        
        Returns:
            dict: 解析后的 JSON 对象
        """
        # 1. Mock 模式
        if self.use_mock:
            return self._mock_query(text, context)
        
        # 2. 确定 Provider
        current_provider = provider or DEFAULT_AI_PROVIDER
        
        # 3. 构建提示词 (Prompt)
        # 我们使用相同的 Prompt 逻辑，以保证输出格式一致
        system_prompt = """# Role
你是一名专业的英语语言教学助手，擅长以简洁、准确的方式向英语学习者解释语言知识。

# Task
接收用户的输入内容，首先判断其属于"词汇 (word)"、"短语 (phrase)"还是"句子 (sentence)"，然后按照指定的 JSON 格式输出教学内容。

# Constraints
1. 输出必须严格遵守 JSON 格式，不要包含Markdown代码块标记（如 ```json）。直接输出 JSON 字符串。
2. 解释内容需简洁明了，适合英语学习者，总字数控制在 100 字以内。
3. 如果是专业术语，必须在解释中包含背景知识。

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
        
        # 4. 执行 API 调用
        try:
            response_text = ""
            
            # 使用线程池执行同步 API 调用，并设置超时
            executor = ThreadPoolExecutor(max_workers=1)
            future = None
            
            try:
                # ============ Moonshot (Kimi) 分支 ============
                if "kimi" in current_provider or "moonshot" in current_provider:
                    if not self.moonshot_client:
                        raise ValueError("Moonshot API Key 未配置，无法使用 Kimi 服务。")
                    
                    logger.debug(f"Calling Moonshot API ({current_provider}) with text: {text[:50]}...")
                    
                    def call_moonshot():
                        completion = self.moonshot_client.chat.completions.create(
                            model=current_provider, # 例如 "kimi-k2-turbo-preview"
                            messages=[
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": user_prompt}
                            ],
                            temperature=0.3, # 降低随机性，保证格式稳定
                        )
                        return completion.choices[0].message.content

                    future = executor.submit(call_moonshot)
                
                # ============ Gemini 分支 ============
                elif "gemini" in current_provider:
                    if not self.gemini_client:
                        raise ValueError("Gemini API Key 未配置，无法使用 Gemini 服务。")
                        
                    logger.debug(f"Calling Gemini API ({current_provider}) with text: {text[:50]}...")
                    
                    def call_gemini():
                        # Gemini 2.5 flash 使用 generate_content
                        # 将 system prompt 和 user prompt 拼接，或者使用 system_instruction (视 SDK 版本而定)
                        # 这里为了兼容性，简单拼接
                        full_prompt = f"{system_prompt}\n\nUser Query:\n{user_prompt}"
                        resp = self.gemini_client.models.generate_content(
                            model=current_provider, # 例如 "gemini-2.5-flash"
                            contents=full_prompt
                        )
                        return resp.text

                    future = executor.submit(call_gemini)
                
                else:
                    raise ValueError(f"不支持的 AI 提供商: {current_provider}")

                # 等待结果（带超时）
                response_text = future.result(timeout=AI_QUERY_TIMEOUT)

            except FutureTimeoutError:
                logger.error(f"AI 查询超时: 超过 {AI_QUERY_TIMEOUT} 秒未返回结果")
                raise TimeoutError(f"AI 查询超时，请稍后重试")
            finally:
                executor.shutdown(wait=False)
            
            if not response_text:
                raise ValueError("AI 返回的响应为空")
            
            # 5. 解析 JSON
            # 移除可能存在的 Markdown 标记
            response_text = response_text.strip()
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.startswith("```"):
                response_text = response_text[3:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            response_text = response_text.strip()
            
            try:
                result = json.loads(response_text)
            except json.JSONDecodeError as e:
                logger.error(f"JSON 解析失败: {e}\n响应内容: {response_text[:200]}")
                raise ValueError(f"AI 返回的内容不是有效的 JSON") from e
            
            # 6. 验证字段
            if "type" not in result or "content" not in result:
                raise ValueError("AI 返回的 JSON 格式不符合规范：缺少 type 或 content 字段")
            
            logger.info(f"AI 查询成功 ({current_provider}): type={result['type']}, text={text[:30]}...")
            return result
            
        except TimeoutError:
            raise
        except ValueError:
            raise
        except Exception as e:
            logger.error(f"AI API 调用失败: {e}", exc_info=True)
            raise Exception(f"AI 查询失败：{str(e)}") from e