# Captures c109
- Branche : cycle/c109-pluie-ciel-couvert (PR #337), commit beba55e
- Graine et temps : valeurs par défaut du mode capture (voir e2e/captures.spec.ts)
- Série : 105 captures. Chromium de la QA (playwright build 1194 réinstallé) : les images sans pluie diffèrent de c108 sur ~0,05 % des pixels (zone des poissons) ; comparées à main rendu dans le même environnement, elles sont identiques à l'octet (12 angles recontrôlés). Seule bassin-top-pluie change (luminance 67,2 → 60,9) ; bassin-three-quarter-pluie : 51,3 → 46,6.
