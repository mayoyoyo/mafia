# Death by vote

- id: `254:848`
- type: FRAME
- section: Night Actions
- size: 390 x 844
- position: x 3400, y 5769

## Layout

- FRAME "Death by vote"  390x844  radius=16
  fill: #000000
  - FRAME "Frame 37"  358x189  layout=VERTICAL  gap=24
    - FRAME "Frame 35"  358x82  layout=VERTICAL  gap=10
      - TEXT "You are"  358x24
        text: "You are"
        font: Grandstander / Grandstander-Regular 24px w400 lh 24px
        fill: #FFFFFF
      - TEXT "DEAD"  358x48
        text: "DEAD"
        font: Grandstander / Grandstander-Black 48px w900 lh auto
        fill: #E53935
    - FRAME "Frame 36"  330x45  layout=VERTICAL  gap=10
      - TEXT "The town has spoken. mo is given to the rope as the town watched. Whether it was justice, no one will ever be sure."  330x45
        text: "The town has spoken. mo is given to the rope as the town watched. Whether it was justice, no one will ever be sure."
        font: Grandstander / Grandstander-Regular 14px w400 lh 15.4px
        fill: #FFFFFF
    - TEXT "Stay quiet, you can still watch the town squirm."  330x14  opacity=60%
      text: "Stay quiet, you can still watch the town squirm."
      font: Grandstander / Grandstander-Regular 14px w400 lh auto
      fill: #FFFFFF
  - FRAME "guillotine"  244x245
    fill: GRADIENT_RADIAL #AA2222 @ 60% -> #000000 @ 60%
    - RECTANGLE "image 8"  200x200
      fill: image fill ref=b16599d8c2a12ed416260aa2f635829bab2f9798
  - FRAME "CTA"  358x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
    fill: #FF6C02
    effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
    - TEXT "Watch the town"  105x14
      text: "Watch the town"
      font: Grandstander / Grandstander-Regular 14px w400 lh auto
      fill: #FFFFFF

## Assets used

- `b16599d8c2a12ed416260aa2f635829bab2f9798` -> assets/fills/b16599d8c2a12ed416260aa2f635829bab2f9798.png

## Wiring

| node id | node name | trigger | target id |
| --- | --- | --- | --- |
| `254:858` | CTA | ON_CLICK | `245:422` |
| `254:858` | CTA | transitionNodeID | `245:422` |
