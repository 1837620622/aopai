# -*- coding: utf-8 -*-
"""
合并 1-7.json 文件并去除重复项
"""

import json
import os
from datetime import datetime

# 工作目录
work_dir = os.path.dirname(os.path.abspath(__file__))

# 读取所有 JSON 文件
all_answers = []
for i in range(1, 8):
    file_path = os.path.join(work_dir, f"{i}.json")
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        all_answers.extend(data.get('answers', []))

print(f"合并前总题目数: {len(all_answers)}")

# 去重：基于 options + answer 组合
seen = set()
unique_answers = []

for item in all_answers:
    # 创建唯一标识：options 转为 tuple + answer
    options_tuple = tuple(item.get('options', []))
    answer = item.get('answer', '')
    key = (options_tuple, answer)
    
    if key not in seen:
        seen.add(key)
        unique_answers.append(item)

print(f"去重后题目数: {len(unique_answers)}")
print(f"去除重复: {len(all_answers) - len(unique_answers)} 条")

# 重新编号
for idx, item in enumerate(unique_answers, 1):
    item['questionNum'] = idx

# 创建合并后的数据结构
merged_data = {
    "exportTime": datetime.now().strftime("%Y/%m/%d %H:%M:%S"),
    "totalQuestions": len(unique_answers),
    "answers": unique_answers
}

# 保存合并后的文件
output_path = os.path.join(work_dir, "merged_questions.json")
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(merged_data, f, ensure_ascii=False, indent=2)

print(f"\n合并完成！输出文件: {output_path}")
