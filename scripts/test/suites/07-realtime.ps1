# Suite 07 — Socket.IO realtime handshake & JWT auth.
# A full WebSocket session isn't practical from PowerShell, but Socket.IO's
# polling-transport handshake (the first `?EIO=4&transport=polling` request)
# is plain HTTP and exposes whether auth + CORS work.

Start-Suite '07' 'Realtime gateway (Socket.IO handshake)'

$u = Get-TestUser

Test-Case 'Socket.IO polling handshake with valid token returns sid' {
    $tok = [System.Web.HttpUtility]::UrlEncode($u.Token)
    $r = Invoke-HttpRaw -Method GET -Url "$script:WsUrl/socket.io/?EIO=4&transport=polling&auth%5Btoken%5D=$tok" -Headers @{
        'Origin' = $script:BaseUrl
    }
    Assert-Eq 200 $r.StatusCode 'handshake 200'
    Assert-Match '"sid":"[^"]+"' $r.Content 'sid present in handshake body'
    Assert-Match '"upgrades":' $r.Content 'upgrades present'
}

Test-Case 'Socket.IO handshake without token is rejected' {
    try {
        $r = Invoke-HttpRaw -Method GET -Url "$script:WsUrl/socket.io/?EIO=4&transport=polling" -Headers @{
            'Origin' = $script:BaseUrl
        }
        # Socket.IO returns a payload like {"code":0,"message":"...UNAUTHENTICATED..."} with status 200.
        # That's still a "rejection" — assert the body says so.
        Assert-Match '(UNAUTHENTICATED|missing token|forbidden)' $r.Content 'auth-failure message'
    } catch {
        if ($_.Exception.Message -notmatch '(HTTP 4|UNAUTHENTICATED|forbidden)') {
            throw "Expected auth rejection, got: $($_.Exception.Message)"
        }
    }
}

Test-Case 'Socket.IO handshake with garbage token is rejected' {
    try {
        $r = Invoke-HttpRaw -Method GET -Url "$script:WsUrl/socket.io/?EIO=4&transport=polling&auth%5Btoken%5D=not-a-jwt" -Headers @{
            'Origin' = $script:BaseUrl
        }
        Assert-Match '(UNAUTHENTICATED|invalid token|forbidden)' $r.Content 'garbage-token rejection message'
    } catch {
        if ($_.Exception.Message -notmatch '(HTTP 4|UNAUTHENTICATED|invalid)') {
            throw "Expected auth rejection, got: $($_.Exception.Message)"
        }
    }
}

End-Suite
