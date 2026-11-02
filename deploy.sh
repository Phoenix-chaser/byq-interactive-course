#!/usr/bin/env bash
# 一键发布到 GitHub Pages（公网访问）
# 前提：已运行 `gh auth login` 完成登录
set -e
cd "$(dirname "$0")"

REPO_NAME="byq-interactive-course"   # 仓库名，可改

if ! gh auth status &>/dev/null; then
  echo "❌ 尚未登录 GitHub。请先运行： gh auth login  （选 GitHub.com → HTTPS → 浏览器登录）"
  exit 1
fi

git add -A
git commit -m "编译原理互动课堂 更新 $(date +%F\ %T)" || true

if git remote | grep -q origin; then
  git push origin main
else
  gh repo create "$REPO_NAME" --public --source=. --push
fi

# 开启 GitHub Pages（main 分支根目录）
gh api -X POST "repos/{owner}/{repo}/pages" \
  -f "source[branch]=main" -f "source[path]=/" 2>/dev/null \
  || gh api -X PUT "repos/{owner}/{repo}/pages" \
       -f "source[branch]=main" -f "source[path]=/"

echo "🌐 发布完成！访问地址： https://<你的用户名>.github.io/$REPO_NAME/"
echo "   （首次发布需等待 1~2 分钟生效）"
