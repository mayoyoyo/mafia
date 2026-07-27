# Fallen detective

- id: `254:686`
- type: FRAME
- section: Night Actions
- size: 390 x 844
- position: x 5350, y 5769

## Layout

- FRAME "Fallen detective"  390x844  radius=16
  fill: #000000
  - FRAME "Container"  358x882  layout=VERTICAL  gap=32
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
    - INSTANCE "Membership Card"  357x222  radius=16  instance of `245:486` "Role=Dead" of set "Membership Card"
      fill: GRADIENT_LINEAR #000000 -> #B5C9E3
      stroke: #FFFFFF 2px
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - TEXT "You are"  57x16
        text: "You are"
        font: Grandstander / Grandstander-Regular 16px w400 lh auto
        fill: #FFFFFF
      - TEXT "DEAD"  110x48
        text: "DEAD"
        font: Grandstander / Grandstander-Black 48px w900 lh auto
        fill: #FFFFFF
      - TEXT "Stay quiet and continue to watch the town"  253x12
        text: "Stay quiet and continue to watch the town"
        font: Grandstander / Grandstander-Regular 12px w400 lh auto
        fill: #FFFFFF
      - RECTANGLE "image 1"  78x78
        fill: image fill ref=f454dffb335ab346b3912d35e9b533fdc0188622
    - FRAME "Frame 31"  358x286  layout=VERTICAL  gap=16
      - FRAME "Frame 31"  234x110  layout=VERTICAL  gap=8
        - RECTANGLE "image 1"  78x78  opacity=30%
          fill: image fill ref=469ed27d0871335a640e9f0b3152a2600f14392f
        - TEXT "Detective has fallen"  234x24
          text: "Detective has fallen"
          font: Grandstander / Grandstander-Regular 24px w400 lh 24px
          fill: #FFFFFF
      - TEXT "No one will be investigated tonight"  241x14
        text: "No one will be investigated tonight"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #FFFFFF
      - FRAME "Players"  358x130  layout=VERTICAL  gap=10  pad=0/16/0/16  radius=16
        effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
        - FRAME "CTA"  326x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
          fill: #232729
          effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
          - TEXT "jenny"  39x14
            text: "jenny"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
          - TEXT "Mafia’s victim"  94x14
            text: "Mafia’s victim"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
        - FRAME "CTA"  326x60  layout=HORIZONTAL  gap=10  pad=16  radius=16  opacity=60%
          fill: #A0A0A0
          effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
          - TEXT "Doctor has fallen"  118x14
            text: "Doctor has fallen"
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

## Assets used

- `469ed27d0871335a640e9f0b3152a2600f14392f` -> assets/fills/469ed27d0871335a640e9f0b3152a2600f14392f.png
- `f454dffb335ab346b3912d35e9b533fdc0188622` -> assets/fills/f454dffb335ab346b3912d35e9b533fdc0188622.png

## Wiring

| node id | node name | trigger | target id |
| --- | --- | --- | --- |
| `I287:4213;287:3467;185:1610` | House | ON_CLICK | `185:1614` |
| `I287:4213;287:3467;185:1610` | House | transitionNodeID | `185:1614` |
| `I287:4213;325:1579` | tab-hotspot-players | ON_CLICK | `287:3435` |
| `I287:4213;325:1579` | tab-hotspot-players | transitionNodeID | `287:3435` |
