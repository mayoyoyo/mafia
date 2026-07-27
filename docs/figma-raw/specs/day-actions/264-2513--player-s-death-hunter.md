# Player's death / Hunter

- id: `264:2513`
- type: FRAME
- section: Day Actions
- size: 390 x 844
- position: x 8330, y 11138

## Layout

- FRAME "Player's death / Hunter"  390x844  radius=16
  fill: #000000
  - FRAME "Frame 37"  358x174  layout=VERTICAL  gap=24
    - FRAME "Frame 35"  358x82  layout=VERTICAL  gap=10
      - TEXT "You are"  358x24
        text: "You are"
        font: Grandstander / Grandstander-Regular 24px w400 lh 24px
        fill: #FFFFFF
      - TEXT "DEAD"  358x48
        text: "DEAD"
        font: Grandstander / Grandstander-Black 48px w900 lh auto
        fill: #E53935
    - TEXT "A single shot, and you go down with the Hunter. The dying take who they please."  358x30
      text: "A single shot, and you go down with the Hunter. The dying take who they please."
      font: Grandstander / Grandstander-Regular 14px w400 lh 15.4px
      fill: #FFFFFF
    - TEXT "Stay quiet, you can still watch the town squirm."  330x14  opacity=60%
      text: "Stay quiet, you can still watch the town squirm."
      font: Grandstander / Grandstander-Regular 14px w400 lh auto
      fill: #FFFFFF
  - FRAME "Skull"  244x245
    fill: GRADIENT_RADIAL #AA2222 @ 60% -> #000000 @ 60%
    - RECTANGLE "image 8"  200x200
      fill: image fill ref=44e37d54633fe164707367837d27e0606ce9e149
  - FRAME "CTA"  358x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
    fill: #FF6C02
    effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
    - TEXT "Watch the town"  105x14
      text: "Watch the town"
      font: Grandstander / Grandstander-Regular 14px w400 lh auto
      fill: #FFFFFF

## Assets used

- `44e37d54633fe164707367837d27e0606ce9e149` -> assets/fills/44e37d54633fe164707367837d27e0606ce9e149.png

## Wiring

_none_
