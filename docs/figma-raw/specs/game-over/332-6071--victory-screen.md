# Victory screen

- id: `332:6071`
- type: FRAME
- section: Game Over
- size: 390 x 844
- position: x 11960, y 5747

## Layout

- FRAME "Victory screen"  390x844  radius=16
  fill: #000000
  - FRAME "After Text"  358x151  layout=VERTICAL  gap=24  opacity=0%
    - FRAME "Frame 37"  358x82  layout=VERTICAL  gap=24
      - FRAME "Frame 35"  358x82  layout=VERTICAL  gap=10
        - TEXT "The final verdict"  358x24
          text: "The final verdict"
          font: Grandstander / Grandstander-Regular 24px w400 lh 24px
          fill: #FFFFFF
        - TEXT "Joker Wins!"  358x48
          text: "Joker Wins!"
          font: Grandstander / Grandstander-Black 48px w900 lh auto
          fill: #D5B5E3
    - TEXT "andrew is smiling as the rope goes taut. They wanted this. You gave it to them, and the joke was never yours to get."  358x45
      text: "andrew is smiling as the rope goes taut. They wanted this. You gave it to them, and the joke was never yours to get."
      font: Grandstander / Grandstander-Regular 14px w400 lh 15.4px
      fill: #FFFFFF
  - FRAME "CTAs"  358x132  layout=VERTICAL  gap=12  opacity=0%
    - FRAME "CTA"  358x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
      fill: #FF6C02
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - TEXT "Return to lobby"  105x14
        text: "Return to lobby"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #FFFFFF
    - FRAME "CTA"  358x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
      fill: #232729
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - TEXT "View game details"  126x14
        text: "View game details"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #FFFFFF
  - FRAME "After"  244x245  opacity=0%
    fill: GRADIENT_RADIAL #D5B5E3 @ 60% -> #000000 @ 60%
    - RECTANGLE "image 8"  200x200
      fill: image fill ref=f0e46bd39f0411658158f36620061035623685ed
  - FRAME "Before Text"  358x82  layout=VERTICAL  gap=24
    - FRAME "Frame 35"  358x82  layout=VERTICAL  gap=10
      - TEXT "The final verdict"  358x24
        text: "The final verdict"
        font: Grandstander / Grandstander-Regular 24px w400 lh 24px
        fill: #FFFFFF
      - TEXT "Joker Wins!"  358x48
        text: "Joker Wins!"
        font: Grandstander / Grandstander-Black 48px w900 lh auto
        fill: #D5B5E3
  - FRAME "Before"  244x245
    fill: GRADIENT_RADIAL #D5B5E3 @ 60% -> #000000 @ 60%
    - RECTANGLE "image 8"  200x200
      fill: image fill ref=f0e46bd39f0411658158f36620061035623685ed

## Assets used

- `f0e46bd39f0411658158f36620061035623685ed` -> assets/fills/f0e46bd39f0411658158f36620061035623685ed.png

## Wiring

| node id | node name | trigger | target id |
| --- | --- | --- | --- |
| `332:6071` | Victory screen | AFTER_TIMEOUT | `332:6092` |
| `332:6071` | Victory screen | transitionNodeID | `332:6092` |
| `332:6079` | CTA | ON_CLICK | `42:782` |
| `332:6079` | CTA | transitionNodeID | `42:782` |
