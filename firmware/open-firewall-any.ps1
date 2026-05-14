# Bench-only: widen the Ember MQTT firewall rule to any remote address.
Remove-NetFirewallRule -DisplayName "Mosquitto MQTT (Ember dev)" -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "Mosquitto MQTT (Ember dev)" `
    -Direction Inbound -Protocol TCP -LocalPort 1883 `
    -Action Allow -Profile Any -RemoteAddress Any | Out-Null

Write-Host "New rule:" -ForegroundColor Green
Get-NetFirewallRule -DisplayName "Mosquitto MQTT (Ember dev)" |
    Format-Table DisplayName, Enabled, Profile, Action -AutoSize

Get-NetFirewallRule -DisplayName "Mosquitto MQTT (Ember dev)" |
    Get-NetFirewallAddressFilter | Format-List RemoteAddress

Start-Sleep -Seconds 3
