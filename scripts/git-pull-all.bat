@echo off
REM ========================================================================
REM Aetheria - Pull all source from GitHub
REM ------------------------------------------------------------------------
REM Edit GIT_USER below if your GitHub username changes.
REM On run, git will prompt for your password / Personal Access Token.
REM (For 2FA accounts: use a Personal Access Token instead of password.)
REM ========================================================================

setlocal

REM ---- EDIT THESE -------------------------------------------------------
set GIT_USER=manhdauvn09-manhds
set GIT_OWNER=manhdauvn09-manhds
set GIT_REPO=Aetheria
set GIT_BRANCH=claude/create-project-structure-3uMmU
set TARGET_DIR=E:\SourceCode\aetheria
REM ----------------------------------------------------------------------

set REMOTE_URL=https://%GIT_USER%@github.com/%GIT_OWNER%/%GIT_REPO%.git

echo ========================================================================
echo  Aetheria - Pull source
echo  User:   %GIT_USER%
echo  Repo:   %GIT_OWNER%/%GIT_REPO%
echo  Branch: %GIT_BRANCH%
echo  Target: %TARGET_DIR%
echo ========================================================================
echo.

if not exist "%TARGET_DIR%\.git" (
    echo [info] Target folder is empty or missing - performing fresh clone...
    if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
    git clone --branch %GIT_BRANCH% %REMOTE_URL% "%TARGET_DIR%"
    if errorlevel 1 goto :fail
    echo.
    echo [done] Clone complete.
    goto :ok
)

echo [info] Existing repo detected - fetching and pulling latest...
cd /d "%TARGET_DIR%"
if errorlevel 1 goto :fail

git fetch origin %GIT_BRANCH%
if errorlevel 1 goto :fail

git checkout %GIT_BRANCH%
if errorlevel 1 goto :fail

git pull origin %GIT_BRANCH%
if errorlevel 1 goto :fail

echo.
echo [done] Pull complete. Local branch is up to date with origin/%GIT_BRANCH%.

:ok
echo.
pause
exit /b 0

:fail
echo.
echo [ERROR] git operation failed. Check the message above.
pause
exit /b 1
