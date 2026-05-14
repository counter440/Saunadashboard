# DIAGNOSTIC: temporarily disable Windows Firewall for the Private profile
# to confirm whether it's the source of the LILYGO connection block.
# Run this elevated, watch the LILYGO serial monitor for ~60 seconds, then run again to re-enable.

$state = (Get-NetFirewallProfile -Name Private).Enabled

if ($state -eq $true) {
    Set-NetFirewallProfile -Name Private -Enabled False
    Write-Host "Private profile firewall is now DISABLED. LILYGO should be able to connect now." -ForegroundColor Yellow
    Write-Host "Watch the serial monitor — if MQTT publishes succeed, the firewall was the block." -ForegroundColor Yellow
    Write-Host "Press any key to RE-ENABLE the firewall..." -ForegroundColor Cyan
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    Set-NetFirewallProfile -Name Private -Enabled True
    Write-Host "Re-enabled." -ForegroundColor Green
} else {
    Set-NetFirewallProfile -Name Private -Enabled True
    Write-Host "Re-enabled the Private profile firewall." -ForegroundColor Green
}
