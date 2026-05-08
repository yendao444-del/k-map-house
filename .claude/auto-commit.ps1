$json = [Console]::In.ReadToEnd()
try { $data = $json | ConvertFrom-Json } catch { exit 0 }

$filePath = $data.tool_input.file_path
$toolName = if ($data.tool_name) { $data.tool_name } else { "Claude" }

if (-not $filePath) { exit 0 }

$repo = "G:/PHONG TRO/app"

git -C $repo add $filePath *>$null

$staged = git -C $repo diff --cached --name-only
if ($staged) {
    git -C $repo commit -q -m "chore: auto-commit by $toolName"
}

exit 0
