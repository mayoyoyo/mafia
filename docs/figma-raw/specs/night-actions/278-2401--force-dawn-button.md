# Force Dawn button

- id: `278:2401`
- type: FRAME
- section: Night Actions
- size: 390 x 844
- position: x 3400, y 3641

## Layout

- FRAME "Force Dawn button"  390x844  radius=16
  fill: #000000
  - FRAME "Container"  358x962  layout=VERTICAL  gap=32
    - FRAME "Nav"  358x24  layout=HORIZONTAL  gap=118
      - FRAME "Frame 28"  148x16  layout=HORIZONTAL  gap=12
        - TEXT "Night 🌙"  62x16
          text: "Night 🌙"
          font: Grandstander / Grandstander-Regular 16px w400 lh auto
          fill: #FFFFFF
        - LINE "Line 5"  0x16
          stroke: #FFFFFF 1px
        - TEXT "Round 4"  62x16
          text: "Round 4"
          font: Grandstander / Grandstander-Regular 16px w400 lh auto
          fill: #FFFFFF
      - FRAME "Frame 7"  149x24  layout=HORIZONTAL  gap=12
        - FRAME "Frame 6"  77x17  layout=HORIZONTAL  gap=4
          - TEXT "Code"  34x17  opacity=50%
            text: "Code"
            font: Helvetica Neue / HelveticaNeue 14px w400 lh auto
            fill: #FFFFFF
          - TEXT "E92G"  39x12
            text: "E92G"
            font: Grandstander / Grandstander-Regular 18px w400 lh auto
            fill: #FF6C02
        - FRAME "icon"  24x24
          - VECTOR "Vector"  0.98x0.98
          - VECTOR "Vector"  22x18
            fill: #FFFFFF
            stroke: #FFFFFF 1px
        - INSTANCE "Settings"  24x24  instance of `42:808` "Settings"
          - VECTOR "Icon"  22x22
            stroke: #FFFFFF 2.5px
    - INSTANCE "Membership Card"  357x222  radius=16  instance of `77:630` "Role=Mafia" of set "Membership Card"
      fill: GRADIENT_LINEAR #000000 -> #D18D83
      stroke: #FFFFFF 2px
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - TEXT "Your role is"  86x16
        text: "Your role is"
        font: Grandstander / Grandstander-Regular 16px w400 lh auto
        fill: #FFFFFF
      - TEXT "Mafia"  130x48
        text: "Mafia"
        font: Grandstander / Grandstander-Black 48px w900 lh auto
        fill: #FFFFFF
      - TEXT "Eliminate citizens until you outnumber them"  266x12
        text: "Eliminate citizens until you outnumber them"
        font: Grandstander / Grandstander-Regular 12px w400 lh auto
        fill: #FFFFFF
      - RECTANGLE "image 1"  78x78
        fill: image fill ref=6252da56cc3d69ce983ec5aa7ba8be590e2665c9
    - TEXT "Choose a victim"  358x24
      text: "Choose a victim"
      font: Grandstander / Grandstander-Regular 24px w400 lh 24px
      fill: #FFFFFF
    - FRAME "Players"  358x310  layout=VERTICAL  gap=10  pad=0/16/0/16  radius=16
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - FRAME "CTA"  326x70  layout=HORIZONTAL  gap=10  pad=16  radius=16
        fill: #232729
        effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
        - TEXT "dale"  30x14
          text: "dale"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
      - FRAME "CTA"  326x70  layout=HORIZONTAL  gap=10  pad=16  radius=16
        fill: #232729
        effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
        - TEXT "jenny"  39x14
          text: "jenny"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
      - FRAME "CTA"  326x70  layout=HORIZONTAL  gap=10  pad=16  radius=16
        fill: #232729
        effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
        - TEXT "kevin"  37x14
          text: "kevin"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
      - FRAME "CTA"  326x70  layout=HORIZONTAL  gap=10  pad=16  radius=16
        fill: #232729
        effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
        - TEXT "natasha"  57x14
          text: "natasha"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
    - INSTANCE "Game Tabs"  358x254  layout=VERTICAL  gap=10  pad=16  radius=16  instance of `287:3436` "Position=Events" of set "Game Tabs"
      fill: #232729
      stroke: #FFFFFF 2px
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - INSTANCE "Tabs"  326x30  layout=HORIZONTAL  gap=16  instance of `185:1612` "Toggle=Left" of set "Tabs"
        - FRAME "Official"  155x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
          fill: #FF6C02
          - TEXT "Events"  44x14
            text: "Events"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
        - FRAME "House"  155x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
          - TEXT "Players"  49x14
            text: "Players"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
      - FRAME "Round 01"  326x14  layout=HORIZONTAL  gap=10
        - TEXT "Round 1"  52x14
          text: "Round 1"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - TEXT "jenny - died in the night"  169x14
          text: "jenny - died in the night"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
      - LINE "Divider"  326x0
        stroke: #FFFFFF 1px
      - FRAME "Round 02"  326x36  layout=HORIZONTAL  gap=10
        - TEXT "Round 2"  53x14
          text: "Round 2"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - FRAME "Frame 22"  159x36  layout=VERTICAL  gap=8
          ...instance internals truncated
      - LINE "Divider"  326x0
        stroke: #FFFFFF 1px
      - FRAME "Round 03"  326x14  layout=HORIZONTAL  gap=10
        - TEXT "Round 3"  54x14
          text: "Round 3"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - TEXT "dale - shot by vigilante"  160x14
          text: "dale - shot by vigilante"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
      - LINE "Divider"  326x0
        stroke: #FFFFFF 1px
      - FRAME "Round 04"  326x58  layout=HORIZONTAL  gap=10
        - TEXT "Round 4"  54x14
          text: "Round 4"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - FRAME "Frame 22"  221x58  layout=VERTICAL  gap=8
          ...instance internals truncated
      - RECTANGLE "tab-hotspot-players"  163x30  radius=15
        fill: #FFFFFF @ 0%
  - FRAME "Drawer"  390x194  layout=VERTICAL  gap=24  pad=16  radius=16  opacity=0%
    fill: #232729
    effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
    - TEXT "Force Dawn"  132x24
      text: "Force Dawn"
      font: Grandstander / Grandstander-Regular 24px w400 lh auto
      fill: #FFFFFF
    - TEXT "Night actions will be skipped and no one will be killed."  358x30
      text: "Night actions will be skipped and no one will be killed."
      font: Grandstander / Grandstander-Regular 14px w400 lh 15.4px
      fill: #FFFFFF
    - FRAME "Frame 3"  358x60  layout=HORIZONTAL  gap=12
      - FRAME "CTA"  173x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
        fill: #FF6C02
        effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
        - TEXT "Force dawn"  77x14
          text: "Force dawn"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
      - FRAME "CTA"  173x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
        fill: #000000
        effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
        - TEXT "Cancel"  46x14
          text: "Cancel"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
  - FRAME "CTA"  358x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
    fill: #FF6C02
    effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
    - TEXT "Force dawn"  77x14
      text: "Force dawn"
      font: Grandstander / Grandstander-Regular 14px w400 lh auto
      fill: #FFFFFF

## Assets used

- `6252da56cc3d69ce983ec5aa7ba8be590e2665c9` -> assets/fills/6252da56cc3d69ce983ec5aa7ba8be590e2665c9.png

## Wiring

| node id | node name | trigger | target id |
| --- | --- | --- | --- |
| `278:2458` | CTA | ON_CLICK | `278:2596` |
| `278:2458` | CTA | transitionNodeID | `278:2596` |
| `287:3324` | CTA | ON_CLICK | `278:2401` |
| `287:3324` | CTA | transitionNodeID | `278:2401` |
| `I287:3440;287:3467;185:1610` | House | ON_CLICK | `185:1614` |
| `I287:3440;287:3467;185:1610` | House | transitionNodeID | `185:1614` |
| `I287:3440;325:1579` | tab-hotspot-players | ON_CLICK | `287:3435` |
| `I287:3440;325:1579` | tab-hotspot-players | transitionNodeID | `287:3435` |
