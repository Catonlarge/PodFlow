"""
将 WhisperX 输出格式转换为 PRD 要求的 cues 格式

WhisperX 格式：
{
    "segments": [
        {
            "start": 0.031,
            "end": 1.789,
            "text": "move to other projects, if",
            "speaker": "SPEAKER_01",
            "words": [...]
        }
    ]
}

PRD 格式：
{
    "cues": [
        {
            "start": 0.031,
            "end": 1.789,
            "speaker": "SPEAKER_01",
            "text": "move to other projects, if"
        }
    ]
}
"""

import json
import sys
from pathlib import Path


def convert_whisperx_to_cues(input_path: str, output_path: str = None) -> dict:
    """
    转换 WhisperX 格式到 PRD cues 格式
    
    Args:
        input_path: WhisperX 输出文件路径
        output_path: 转换后的文件路径（可选，默认为 input_path_cues.json）
    
    Returns:
        转换后的 cues 数据
    """
    print("=" * 60)
    print("Converting WhisperX format to PRD cues format...")
    print("=" * 60)
    
    # 读取 WhisperX 输出
    print(f"\nReading: {input_path}")
    with open(input_path, 'r', encoding='utf-8') as f:
        whisperx_data = json.load(f)
    
    if "segments" not in whisperx_data:
        raise ValueError("Input file does not have 'segments' field")
    
    segments = whisperx_data["segments"]
    print(f"Found {len(segments)} segments")
    
    # 转换为 cues 格式
    cues = []
    for segment in segments:
        cue = {
            "start": segment["start"],
            "end": segment["end"],
            "text": segment["text"].strip(),
            "speaker": segment.get("speaker", "Unknown")
        }
        cues.append(cue)
    
    # 构建 PRD 格式
    prd_format = {
        "cues": cues
    }
    
    # 确定输出路径
    if output_path is None:
        input_file = Path(input_path)
        output_path = input_file.parent / f"{input_file.stem}_cues.json"
    
    # 保存转换后的文件
    print(f"\nWriting: {output_path}")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(prd_format, f, ensure_ascii=False, indent=2)
    
    print(f"\n[OK] Conversion completed!")
    print(f"  - Input:  {len(segments)} segments")
    print(f"  - Output: {len(cues)} cues")
    print(f"  - File:   {output_path}")
    
    return prd_format


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Convert WhisperX format to PRD cues format")
    parser.add_argument("input", help="WhisperX output JSON file")
    parser.add_argument("-o", "--output", help="Output file path (optional)")
    
    args = parser.parse_args()
    
    try:
        convert_whisperx_to_cues(args.input, args.output)
    except Exception as e:
        print(f"\n[ERROR] {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

