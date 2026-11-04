param(
  [string]$SourceHost = "127.0.0.1",
  [int]$SourcePort = 5432,
  [string]$SourceDatabase = "si_data",
  [string]$SourceUser = "postgres",

  [Parameter(Mandatory = $true)]
  [string]$TargetHost,
  [int]$TargetPort = 5432,
  [string]$TargetDatabase = "sisdmk2026",
  [string]$TargetUser = "postgres",

  [string]$PostgresBin = "",
  [string]$BackupDir = ".\backups",
  [switch]$CreateTargetDatabase,
  [switch]$CleanTarget,
  [switch]$Yes
)

$ErrorActionPreference = "Stop"

function Add-PostgresBinToPath {
  if ($PostgresBin) {
    if (-not (Test-Path -LiteralPath (Join-Path $PostgresBin "pg_dump.exe"))) {
      throw "PostgresBin '$PostgresBin' tidak berisi pg_dump.exe."
    }
    $env:Path = "$PostgresBin;$env:Path"
    return
  }

  $candidates = @(
    "C:\Program Files\PostgreSQL\18\bin",
    "C:\Program Files\PostgreSQL\17\bin",
    "C:\Program Files\PostgreSQL\16\bin",
    "C:\Program Files\PostgreSQL\15\bin",
    "C:\Program Files\PostgreSQL\14\bin"
  )

  $existing = $candidates | Where-Object { Test-Path -LiteralPath (Join-Path $_ "pg_dump.exe") }
  if ($existing.Count -gt 0) {
    $env:Path = "$($existing[0]);$env:Path"
    return
  }

  $programFiles = "C:\Program Files\PostgreSQL"
  if (Test-Path -LiteralPath $programFiles) {
    $found = Get-ChildItem -LiteralPath $programFiles -Directory -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending |
      ForEach-Object { Join-Path $_.FullName "bin" } |
      Where-Object { Test-Path -LiteralPath (Join-Path $_ "pg_dump.exe") } |
      Select-Object -First 1

    if ($found) {
      $env:Path = "$found;$env:Path"
    }
  }
}

function Require-Command {
  param([string]$Name)
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "Command '$Name' tidak ditemukan. Tambahkan folder PostgreSQL bin ke PATH, contoh: C:\Program Files\PostgreSQL\16\bin"
  }
}

function Read-PasswordText {
  param([string]$Prompt)
  $secure = Read-Host $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Quote-SqlIdentifier {
  param([string]$Value)
  '"' + $Value.Replace('"', '""') + '"'
}

Add-PostgresBinToPath
Require-Command "pg_dump"
Require-Command "pg_restore"
Require-Command "psql"

$resolvedBackupDir = Resolve-Path -LiteralPath $BackupDir -ErrorAction SilentlyContinue
if (-not $resolvedBackupDir) {
  New-Item -ItemType Directory -Path $BackupDir | Out-Null
  $resolvedBackupDir = Resolve-Path -LiteralPath $BackupDir
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = Join-Path $resolvedBackupDir "backup-$SourceDatabase-$timestamp.dump"

Write-Host "Backup source database: $SourceHost`:$SourcePort/$SourceDatabase"
$sourcePassword = Read-PasswordText "Password source PostgreSQL user '$SourceUser'"
$env:PGPASSWORD = $sourcePassword
try {
  pg_dump `
    --host $SourceHost `
    --port $SourcePort `
    --username $SourceUser `
    --format custom `
    --verbose `
    --file $backupFile `
    $SourceDatabase
} finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host "Backup selesai: $backupFile"
Write-Host "Target restore: $TargetHost`:$TargetPort/$TargetDatabase"

if ($CleanTarget -and -not $Yes) {
  $answer = Read-Host "CleanTarget akan menghapus object lama di database target sebelum restore. Ketik RESTORE untuk lanjut"
  if ($answer -ne "RESTORE") {
    throw "Restore dibatalkan."
  }
}

$targetPassword = Read-PasswordText "Password target PostgreSQL user '$TargetUser'"
$env:PGPASSWORD = $targetPassword
try {
  $targetExists = psql `
    --host $TargetHost `
    --port $TargetPort `
    --username $TargetUser `
    --dbname postgres `
    --tuples-only `
    --no-align `
    --command "SELECT 1 FROM pg_database WHERE datname = '$TargetDatabase';"

  if (-not ($targetExists -contains "1")) {
    if (-not $CreateTargetDatabase) {
      throw "Database target '$TargetDatabase' belum ada. Buat dulu di server, atau jalankan lagi dengan -CreateTargetDatabase."
    }

    $quotedTargetDatabase = Quote-SqlIdentifier $TargetDatabase
    psql `
      --host $TargetHost `
      --port $TargetPort `
      --username $TargetUser `
      --dbname postgres `
      --command "CREATE DATABASE $quotedTargetDatabase;"
  }

  $restoreArgs = @(
    "--host", $TargetHost,
    "--port", $TargetPort,
    "--username", $TargetUser,
    "--dbname", $TargetDatabase,
    "--verbose",
    "--no-owner",
    "--no-acl"
  )

  if ($CleanTarget) {
    $restoreArgs += @("--clean", "--if-exists")
  }

  $restoreArgs += $backupFile
  pg_restore @restoreArgs
} finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host "Restore selesai ke $TargetDatabase di $TargetHost."
