"""
Gemini API 验证脚本

用于验证 Gemini API 是否可以正常调用并返回结果。
可以通过命令行直接运行此脚本来测试 AI 服务。

用法:
    python -m app.utils.test_gemini_api
    python -m app.utils.test_gemini_api "hello"
    python -m app.utils.test_gemini_api "Black swan event"
"""
import json
import sys
import io
from typing import Optional

# 设置 UTF-8 输出（解决 Windows 控制台编码问题）
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if sys.stderr.encoding != 'utf-8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from app.services.ai_service import AIService


def test_gemini_api(query_text: str = "hello") -> int:
    """
    测试 Gemini API 调用
    
    Args:
        query_text: 要查询的文本，默认为 "hello"
    
    Returns:
        0 表示成功，1 表示失败
    """
    try:
        print(f"[INFO] Initializing AIService...")
        service = AIService()
        print("[OK] AIService initialized successfully")
        
        print(f"\n[INFO] Testing query: '{query_text}'")
        result = service.query(query_text)
        
        print("\n[OK] API call successful!")
        print("\n[RESPONSE]")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        
        # 验证结果格式
        assert "type" in result, "Missing 'type' field"
        assert "content" in result, "Missing 'content' field"
        assert result["type"] in ["word", "phrase", "sentence"], f"Invalid type: {result['type']}"
        
        print("\n[OK] Response format validation passed")
        print(f"  - Type: {result['type']}")
        
        if result["type"] in ["word", "phrase"]:
            phonetic = result['content'].get('phonetic', 'N/A')
            definition = result['content'].get('definition', 'N/A')
            explanation = result['content'].get('explanation', 'N/A')
            print(f"  - Phonetic: {phonetic}")
            print(f"  - Definition: {definition}")
            print(f"  - Explanation: {explanation[:50]}..." if len(explanation) > 50 else f"  - Explanation: {explanation}")
        elif result["type"] == "sentence":
            translation = result['content'].get('translation', 'N/A')
            highlight_vocab = result['content'].get('highlight_vocabulary', [])
            print(f"  - Translation: {translation}")
            print(f"  - Highlight Vocabulary: {len(highlight_vocab)} items")
            for item in highlight_vocab[:3]:  # 只显示前3个
                print(f"    * {item.get('term', 'N/A')}: {item.get('definition', 'N/A')}")
        
        print("\n[SUCCESS] All checks passed!")
        return 0
        
    except ValueError as e:
        print(f"\n[ERROR] Validation error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"\n[ERROR] API call failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1


def main():
    """主函数：从命令行参数获取查询文本"""
    query_text = sys.argv[1] if len(sys.argv) > 1 else "hello"
    sys.exit(test_gemini_api(query_text))


if __name__ == "__main__":
    main()

