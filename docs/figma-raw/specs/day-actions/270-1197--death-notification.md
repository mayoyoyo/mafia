# Death notification

- id: `270:1197`
- type: FRAME
- section: Day Actions
- size: 390 x 844
- position: x 8980, y 10085

## Layout

- FRAME "Death notification"  390x844  radius=16
  fill: #000000
  - FRAME "Frame 35"  358x82  layout=VERTICAL  gap=10
    - TEXT "jenny died of"  358x24
      text: "jenny died of"
      font: Grandstander / Grandstander-Regular 24px w400 lh 24px
      fill: #FFFFFF
    - TEXT "HEARTBREAK"  358x48
      text: "HEARTBREAK"
      font: Grandstander / Grandstander-Black 48px w900 lh auto
      fill: #E53935
  - TEXT "The verdict"  358x24
    text: "The verdict"
    font: Grandstander / Grandstander-Regular 24px w400 lh 24px
    fill: #FFFFFF
  - FRAME "Skull"  244x245
    fill: GRADIENT_RADIAL #AA2222 @ 60% -> #000000 @ 60%
    - RECTANGLE "image 8"  200x200
      fill: image fill ref=142227b5913573f6b6385854d980edc3fd06ecb9

## Assets used

- `142227b5913573f6b6385854d980edc3fd06ecb9` -> assets/fills/142227b5913573f6b6385854d980edc3fd06ecb9.png

## Wiring

_none_
