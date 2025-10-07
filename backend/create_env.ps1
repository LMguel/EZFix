<#
  Script simples para criar um arquivo .env local a partir de .env.example
  NÃO adiciona valores sensíveis — apenas copia o template.

  Uso:
    powershell -ExecutionPolicy Bypass -File .\backend\create_env.ps1
#>

$example = Join-Path -Path $PSScriptRoot -ChildPath '.env.example'
$target = Join-Path -Path $PSScriptRoot -ChildPath '.env'

if (-Not (Test-Path $example)) {
  Write-Error "Arquivo .env.example não encontrado em $PSScriptRoot"
  exit 1
}

if (Test-Path $target) {
  Write-Host "Arquivo .env já existe em $target. Use um editor para ajustá-lo ou remova antes de criar." -ForegroundColor Yellow
  exit 0
}

Copy-Item -Path $example -Destination $target
Write-Host ".env criado a partir do template: $target" -ForegroundColor Green
Write-Host "Substitua os placeholders no arquivo com as suas chaves antes de rodar o servidor." -ForegroundColor Cyan
