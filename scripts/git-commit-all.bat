@echo off
REM ========================================================================
REM Aetheria - Commit all changes and push to GitHub
REM ------------------------------------------------------------------------
REM Edit GIT_USER below if your GitHub username changes.
REM Usage: git-commit-all.bat ["optional commit message"]
REM   - If no message is provided, you will be prompted.
REM On push, git will prompt for your password / Personal Access Token.
REM (For 2FA accounts: use a Personal Access Token instead of password.)
REM ========================================================================

setlocal enabledelayedexpansion

REM ---- EDIT THESE -------------------------------------------------------
set GIT_USER=manhdauvn09-manhds
set GIT_OWNER=manhdauvn09-manhds
set GIT_REPO=Aetheria
set GIT_BRANCH=claude/create-project-structure-3uMmU
set TARGET_DIR=E:\SourceCode\aetheria
REM ----------------------------------------------------------------------

set REMOTE_URL=https://%GIT_USER%@github.com/%GIT_OWNER%/%GIT_REPO%.git

if not exist "%TARGET_DIR%\.git" (
    echo [ERROR] No git repo found at %TARGET_DIR%
    echo         Run git-pull-all.bat first.
    pause
    exit /b 1
)

cd /d "%TARGET_DIR%"
if errorlevel 1 goto :fail

echo ========================================================================
echo  Aetheria - Commit and push
echo  User:   %GIT_USER%
echo  Repo:   %GIT_OWNER%/%GIT_REPO%
echo  Branch: %GIT_BRANCH%
echo  Folder: %TARGET_DIR%
echo ========================================================================
echo.

REM Make sure remote is using the configured user (re-set in case it drifted).
git remote set-url origin %REMOTE_URL%

REM Make sure we're on the right branch.
git checkout %GIT_BRANCH% 2>nul
if errorlevel 1 (
    echo [info] Branch %GIT_BRANCH% not found locally - creating it.
    git checkout -b %GIT_BRANCH%
    if errorlevel 1 goto :fail
)

echo [info] Working tree status:
git status --short
echo.

git diff --cached --quiet
set CACHED_EMPTY=!errorlevel!
git diff --quiet
set UNSTAGED_EMPTY=!errorlevel!

if "!CACHED_EMPTY!"=="0" if "!UNSTAGED_EMPTY!"=="0" (
    REM Check for untracked files too.
    for /f %%i in ('git ls-files --others --exclude-standard ^| find /c /v ""') do set UNTRACKED=%%i
    if "!UNTRACKED!"=="0" (
        echo [info] Nothing to commit. Pushing in case local is ahead of remote...
        git push -u origin %GIT_BRANCH%
        if errorlevel 1 goto :fail
        goto :ok
    )
)

REM Get commit message from arg or prompt.
set "MSG=%~1"
if "!MSG!"=="" (
    set /p MSG=Enter commit message:
)
if "!MSG!"=="" (
    echo [ERROR] Empty commit message - aborting.
    pause
    exit /b 1
)

echo.
echo [info] Staging all changes...
git add -A
if errorlevel 1 goto :fail

echo [info] Creating commit...
git commit -m "!MSG!"
if errorlevel 1 goto :fail

echo [info] Pushing to origin/%GIT_BRANCH% ...
git push -u origin %GIT_BRANCH%
if errorlevel 1 goto :fail

:ok
echo.
echo [done] Commit and push complete.
git log --oneline -5
echo.
pause
exit /b 0

:fail
echo.
echo [ERROR] git operation failed. Check the message above.
pause
exit /b 1
