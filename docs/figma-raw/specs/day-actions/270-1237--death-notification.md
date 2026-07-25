# Death notification

- id: `270:1237`
- type: FRAME
- section: Day Actions
- size: 390 x 844
- position: x 8980, y 6926

## Layout

- FRAME "Death notification"  390x844  radius=16
  fill: #000000
  - FRAME "Frame 35"  358x82  layout=VERTICAL  gap=10
    - TEXT "jenny didn’t"  358x24
      text: "jenny didn’t"
      font: Grandstander / Grandstander-Regular 24px w400 lh 24px
      fill: #FFFFFF
    - TEXT "SURVIVE"  358x48
      text: "SURVIVE"
      font: Grandstander / Grandstander-Black 48px w900 lh auto
      fill: #E53935
  - TEXT "The verdict"  358x24
    text: "The verdict"
    font: Grandstander / Grandstander-Regular 24px w400 lh 24px
    fill: #FFFFFF
  - FRAME "Skull"  244x245
    fill: GRADIENT_RADIAL #AA2222 @ 60% -> #000000 @ 60%
    - RECTANGLE "image 8"  200x200
      fill: image fill ref=f454dffb335ab346b3912d35e9b533fdc0188622

## Assets used

- `f454dffb335ab346b3912d35e9b533fdc0188622` -> assets/fills/f454dffb335ab346b3912d35e9b533fdc0188622.png

## Wiring

_none_
