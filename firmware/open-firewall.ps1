# Run this once as Administrator to let the LILYGO reach the bench Mosquitto.
# Allows inbound TCP 1883 from the local subnet only.

New-NetFirewallRule `
    -DisplayName "Mosquitto MQTT (Ember dev)" `
    -Direction Inbound -Protocol TCP -LocalPort 1883 `
    -Action Allow -Profile Private,Domain `
    -RemoteAddress LocalSubnet | Out-Null

Write-Host "Done. Rule:" -ForegroundColor Green
Get-NetFirewallRule -DisplayName "Mosquitto MQTT (Ember dev)" |
    Select-Object DisplayName, Enabled, Direction, Action |
    Format-Table -AutoSize

Write-Host "Press any key to close..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
