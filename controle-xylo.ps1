# Controle du dossier XYLO - FIDAL Notaires Paris
# Verifie que les 189 documents attendus sont presents, correctement nommes et non vides.
# Lancement : clic droit > Executer avec PowerShell
#   ou : powershell -ExecutionPolicy Bypass -File "controle-xylo.ps1"

param(
  [string]$Dossier = 'F:\Utilisat\JFD\XYLO'
)

$attendus = @(
  'ap-09213-termites-20030825.pdf',
  'ap-10037-merule-20210215.pdf',
  'ap-10289-merule-20240129.pdf',
  'ap-10290-merule-20190319.pdf',
  'ap-10362-merule-20190211.pdf',
  'ap-10387-merule-20220114.pdf',
  'ap-10401-merule-20220301.pdf',
  'ap-10426-merule-20241108.pdf',
  'ap-16028-merule-20220722.pdf',
  'ap-16042-merule-20190507.pdf',
  'ap-16111-merule-20221208.pdf',
  'ap-16113-merule-20231214.pdf',
  'ap-16175-merule-20190507.pdf',
  'ap-16292-merule-20190604.pdf',
  'ap-18033-termites-20030619.pdf',
  'ap-23020-merule-20241220.pdf',
  'ap-23071-merule-20250506.pdf',
  'ap-26309-merule-20210915.pdf',
  'ap-26362-termites-20100324.pdf',
  'ap-35004-merule-20230921.pdf',
  'ap-35332-termites-20070521.pdf',
  'ap-39300-merule-20221114.pdf',
  'ap-39500-merule-20170213.pdf',
  'ap-41241-termites-20121122.pdf',
  'ap-43080-merule-20211206.pdf',
  'ap-50002-merule-20260330.pdf',
  'ap-50041-merule-20260330.pdf',
  'ap-50082-merule-20260330.pdf',
  'ap-50099-merule-20260330.pdf',
  'ap-50102-merule-20260330.pdf',
  'ap-50110-merule-20260330.pdf',
  'ap-50129-merule-20260330.pdf',
  'ap-50147-merule-20260330.pdf',
  'ap-50218-merule-20260330.pdf',
  'ap-50236-merule-20260330.pdf',
  'ap-50267-merule-20260330.pdf',
  'ap-50292-merule-20260330.pdf',
  'ap-50297-merule-20260330.pdf',
  'ap-50321-merule-20260330.pdf',
  'ap-50341-merule-20260330.pdf',
  'ap-50359-merule-20260330.pdf',
  'ap-50391-merule-20260330.pdf',
  'ap-50402-merule-20260330.pdf',
  'ap-50407-merule-20260330.pdf',
  'ap-50410-merule-20260330.pdf',
  'ap-50474-merule-20260330.pdf',
  'ap-50480-merule-20260330.pdf',
  'ap-50487-merule-20260330.pdf',
  'ap-50532-merule-20260330.pdf',
  'ap-50551-merule-20260330.pdf',
  'ap-50562-merule-20260330.pdf',
  'ap-50592-merule-20260602.pdf',
  'ap-50593-merule-20260330.pdf',
  'ap-50615-merule-20260330.pdf',
  'ap-50639-merule-20260330.pdf',
  'ap-56121-termites-20030603.pdf',
  'ap-56240-termites-20031211.pdf',
  'ap-57132-merule-20231204.pdf',
  'ap-57443-merule-20140115.pdf',
  'ap-57543-merule-20160805.pdf',
  'ap-62193-termites-20031122.pdf',
  'ap-63028-merule-20210329.pdf',
  'ap-63047-merule-20180511.pdf',
  'ap-63066-merule-20210329.pdf',
  'ap-63113-merule-20200421.pdf',
  'ap-63192-merule-20210409.pdf',
  'ap-63236-merule-20210208.pdf',
  'ap-63384-merule-20250317.pdf',
  'ap-63430-merule-20190617.pdf',
  'ap-68162-merule-20200824.pdf',
  'ap-69123-merule-20230530.pdf',
  'ap-69123-termites-20090527.pdf',
  'ap-72001-termites-20090827.pdf',
  'ap-72003-termites-20100525.pdf',
  'ap-72008-termites-20010313.pdf',
  'ap-72029-termites-20241030.pdf',
  'ap-72058-termites-20230330.pdf',
  'ap-72146-termites-20220307.pdf',
  'ap-72147-termites-20030428.pdf',
  'ap-72181-termites-20240411.pdf',
  'ap-72223-termites-20050318.pdf',
  'ap-72254-termites-20230120.pdf',
  'ap-72339-termites-20141031.pdf',
  'ap-72350-termites-20060524.pdf',
  'ap-72380-termites-20230315.pdf',
  'ap-76758-merule-20250318.pdf',
  'ap-84007-merule-20200127.pdf',
  'ap-84025-termites-20020604.pdf',
  'ap-84047-termites-20010829.pdf',
  'ap-84102-termites-20130916.pdf',
  'ap-88116-merule-20230613.pdf',
  'ap-88160-merule-20230613.pdf',
  'ap-88275-merule-20230705.pdf',
  'ap-88346-merule-20230905.pdf',
  'ap-88349-merule-20230705.pdf',
  'ap-88468-merule-20230418.pdf',
  'ap-88500-merule-20230525.pdf',
  'ap-88526-merule-20230120.pdf',
  'ap-91027-termites-20020222.pdf',
  'ap-91045-termites-20010903.pdf',
  'ap-91103-termites-20230531.pdf',
  'ap-91179-termites-20030328.pdf',
  'ap-91223-termites-20060426.pdf',
  'ap-91326-termites-20010903.pdf',
  'ap-91405-termites-20010518.pdf',
  'ap-91479-termites-20230109.pdf',
  'ap-91589-termites-20230109.pdf',
  'ap-91667-termites-20250930.pdf',
  'ap-91687-termites-20050113.pdf',
  'ap-91691-termites-20020415.pdf',
  'ap-93006-termites-20030117.pdf',
  'ap-93007-termites-20051102.pdf',
  'ap-93008-termites-20150129.pdf',
  'ap-93029-termites-20100817.pdf',
  'ap-93045-termites-20051102.pdf',
  'ap-93046-termites-20011005.pdf',
  'ap-93048-termites-20051102.pdf',
  'ap-93062-termites-20200706.pdf',
  'ap-93070-termites-20011005.pdf',
  'ap-94022-termites-20150407.pdf',
  'ap-94028-termites-20111028.pdf',
  'ap-94033-termites-20160816.pdf',
  'ap-94037-termites-20131118.pdf',
  'ap-94041-termites-20011016.pdf',
  'ap-94046-termites-20010709.pdf',
  'ap-94054-termites-20221013.pdf',
  'ap-94068-termites-20140630.pdf',
  'ap-94076-termites-20130904.pdf',
  'ap-94079-termites-20011113.pdf',
  'ap-94081-termites-20171116.pdf',
  'ap-95210-termites-20121113.pdf',
  'ap-dep02-merule-20251030-annexe.pdf',
  'ap-dep02-merule-20251030.pdf',
  'ap-dep06-termites-20170310.pdf',
  'ap-dep11-termites-20010123.pdf',
  'ap-dep12-termites-20030613.pdf',
  'ap-dep13-termites-20010901.pdf',
  'ap-dep14-merule-20240604.pdf',
  'ap-dep15-termites-20220513.pdf',
  'ap-dep16-termites-20050308.pdf',
  'ap-dep17-termites-20170127.pdf',
  'ap-dep19-merule-20230424.pdf',
  'ap-dep19-termites-20011214.pdf',
  'ap-dep24-termites-20010911.pdf',
  'ap-dep27-merule-20251118.pdf',
  'ap-dep29-merule-20240130.pdf',
  'ap-dep2A-termites-20040720.pdf',
  'ap-dep2B-termites-20011127.pdf',
  'ap-dep30-termites-20031015.pdf',
  'ap-dep31-termites-20011210.pdf',
  'ap-dep32-termites-20020107.pdf',
  'ap-dep33-termites-20010212.pdf',
  'ap-dep34-termites-20010620.pdf',
  'ap-dep36-merule-20220525.pdf',
  'ap-dep36-merule-20230121.pdf',
  'ap-dep36-merule-20250605.pdf',
  'ap-dep36-termites-20210526.pdf',
  'ap-dep37-termites-20190606.pdf',
  'ap-dep38-termites-20021001.pdf',
  'ap-dep40-termites-20020626.pdf',
  'ap-dep44-termites-20181113.pdf',
  'ap-dep46-termites-20001201.pdf',
  'ap-dep47-termites-20020305.pdf',
  'ap-dep49-termites-20250130.pdf',
  'ap-dep60-merule-20240418.pdf',
  'ap-dep61-merule-20250914.pdf',
  'ap-dep64-termites-20010816.pdf',
  'ap-dep65-termites-20090526.pdf',
  'ap-dep66-termites-20010327.pdf',
  'ap-dep69-termites-20080604.pdf',
  'ap-dep75-termites-20120925.pdf',
  'ap-dep76-termites-20230612.pdf',
  'ap-dep78-termites-20171026.pdf',
  'ap-dep79-merule-20250730.pdf',
  'ap-dep79-termites-20260209.pdf',
  'ap-dep80-merule-20220831.pdf',
  'ap-dep81-termites-20021029.pdf',
  'ap-dep82-termites-20000706.pdf',
  'ap-dep83-termites-20181210.pdf',
  'ap-dep84-termites-20010406.pdf',
  'ap-dep85-termites-20080619.pdf',
  'ap-dep86-termites-20201014.pdf',
  'ap-dep92-termites-20041222.pdf',
  'ap-dep971-termites-20010511.pdf',
  'ap-dep972-termites-20010426.pdf',
  'ap-dep973-termites-20030226.pdf',
  'ap-dep974-termites-20010411.pdf',
  'raa-dep50-merule-20260403.pdf',
  'raa-dep50-merule-20260604.pdf'
)

Write-Host ''
Write-Host "Dossier controle : $Dossier" -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $Dossier)) {
  Write-Host "Dossier introuvable. Relancez en passant le chemin :" -ForegroundColor Red
  Write-Host '  powershell -ExecutionPolicy Bypass -File "controle-xylo.ps1" -Dossier "X:\chemin\XYLO"'
  Read-Host 'Entree pour fermer'
  exit 1
}

$presents = @(Get-ChildItem -LiteralPath $Dossier -Filter *.pdf -File | Select-Object -ExpandProperty Name)

$manquants = @($attendus | Where-Object { $presents -notcontains $_ })
$intrus    = @($presents | Where-Object { $attendus -notcontains $_ })
$vides     = @(Get-ChildItem -LiteralPath $Dossier -Filter *.pdf -File | Where-Object { $_.Length -lt 5120 } |
                ForEach-Object { '{0} ({1} octets)' -f $_.Name, $_.Length })

Write-Host ''
Write-Host ("Attendus : {0}   Presents : {1}" -f $attendus.Count, $presents.Count)
Write-Host ''

if ($manquants.Count -eq 0) {
  Write-Host 'Aucun arrete manquant.' -ForegroundColor Green
} else {
  Write-Host ("{0} arrete(s) MANQUANT(S) :" -f $manquants.Count) -ForegroundColor Red
  $manquants | ForEach-Object { Write-Host "   $_" }
}

Write-Host ''
if ($intrus.Count -eq 0) {
  Write-Host 'Aucun fichier hors convention de nommage.' -ForegroundColor Green
} else {
  Write-Host ("{0} fichier(s) au nom INATTENDU (mal nomme, doublon type 'nom (1).pdf', ou hors perimetre) :" -f $intrus.Count) -ForegroundColor Yellow
  $intrus | ForEach-Object { Write-Host "   $_" }
}

Write-Host ''
if ($vides.Count -eq 0) {
  Write-Host 'Aucun PDF suspect (tous font plus de 5 Ko).' -ForegroundColor Green
} else {
  Write-Host ("{0} PDF anormalement petit(s), a rouvrir :" -f $vides.Count) -ForegroundColor Yellow
  $vides | ForEach-Object { Write-Host "   $_" }
}

Write-Host ''
$rapport = Join-Path $Dossier 'controle-xylo.txt'
$lignes = @(
  "Controle XYLO du $(Get-Date -Format 'dd/MM/yyyy HH:mm')",
  "Dossier : $Dossier",
  "Attendus : $($attendus.Count)  Presents : $($presents.Count)",
  '',
  "MANQUANTS ($($manquants.Count)) :"
) + $manquants + @(
  '',
  "NOMS INATTENDUS ($($intrus.Count)) :"
) + $intrus + @(
  '',
  "PDF SUSPECTS ($($vides.Count)) :"
) + $vides
$lignes | Set-Content -LiteralPath $rapport -Encoding UTF8
Write-Host "Rapport ecrit : $rapport" -ForegroundColor Cyan
Write-Host ''
Read-Host 'Entree pour fermer'
