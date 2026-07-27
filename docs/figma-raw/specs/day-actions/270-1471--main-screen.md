# Main screen

- id: `270:1471`
- type: FRAME
- section: Day Actions
- size: 390 x 844
- position: x 8330, y 3641

## Layout

- FRAME "Main screen"  390x844  radius=16
  fill: #000000
  - FRAME "Container"  358x1116  layout=VERTICAL  gap=32
    - FRAME "Nav"  358x24  layout=HORIZONTAL  gap=118
      - FRAME "Frame 28"  136x16  layout=HORIZONTAL  gap=12
        - TEXT "Day ☀️"  50x16
          text: "Day ☀️"
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
    - INSTANCE "Membership Card"  357x222  layout=VERTICAL  gap=10  pad=93/166/93/166  radius=16  instance of `77:527` "Role=Default" of set "Membership Card"
      fill: GRADIENT_LINEAR #000000 -> #B5C9E3
      stroke: #FFFFFF 2px
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - TEXT "Your role is"  86x16
        text: "Your role is"
        font: Grandstander / Grandstander-Regular 16px w400 lh auto
        fill: #FFFFFF
      - TEXT "?"  25x35
        text: "?"
        font: Grandstander / Grandstander-Black 48px w900 lh auto
        fill: #FFFFFF
      - TEXT "Peel to reveal"  158x24
        text: "Peel to reveal"
        font: Grandstander / Grandstander-Regular 24px w400 lh auto
        fill: #FFFFFF
      - FRAME "Frame 1"  28x28
        - RECTANGLE "Rectangle 1"  28x28
          fill: #B5C9E3
          stroke: #FFFFFF 2px
        - VECTOR "Rectangle 2"  28x28
          fill: #B5C9E3
          fill: #000000 @ 60%
          stroke: #FFFFFF 2px
    - TEXT "Dawn breaks. The town wakes to find mo dead in the square."  358x36
      text: "Dawn breaks. The town wakes to find mo dead in the square."
      font: Grandstander / Grandstander-Italic 18px w400 lh 18px
      fill: #FFFFFF
    - FRAME "Lobby rules"  358x452  layout=VERTICAL  gap=10  pad=16  radius=16
      fill: #232729
      stroke: #FFFFFF 2px
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - FRAME "Frame 8"  326x30  layout=HORIZONTAL  gap=10  pad=8/0/8/0
        stroke: #FFFFFF 1px
        - TEXT "Admin Controls"  105x14
          text: "Admin Controls"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
      - FRAME "Frame 9"  326x30  layout=HORIZONTAL  gap=10  pad=8/0/8/0
        - TEXT "Nominate a player for execution"  223x14
          text: "Nominate a player for execution"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
      - FRAME "Players"  326x340  layout=VERTICAL  gap=10  radius=16
        effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
        - FRAME "CTA"  326x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
          fill: #000000
          effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
          - TEXT "dale"  30x14
            text: "dale"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
        - FRAME "CTA"  326x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
          fill: #000000
          effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
          - TEXT "jenny"  39x14
            text: "jenny"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
        - FRAME "CTA"  326x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
          fill: #000000
          effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
          - TEXT "kevin"  37x14
            text: "kevin"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
        - FRAME "CTA"  326x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
          fill: #000000
          effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
          - TEXT "natasha"  57x14
            text: "natasha"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
        - FRAME "CTA"  326x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
          fill: #FF6C02
          effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
          - TEXT "End day"  54x14
            text: "End day"
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
  - FRAME "Drawer"  390x178  layout=VERTICAL  gap=24  pad=16  radius=16  opacity=0%
    fill: #232729
    effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
    - TEXT "End Day"  93x24
      text: "End Day"
      font: Grandstander / Grandstander-Regular 24px w400 lh auto
      fill: #FFFFFF
    - TEXT "End the day and transition to night?"  253x14
      text: "End the day and transition to night?"
      font: Grandstander / Grandstander-Regular 14px w400 lh auto
      fill: #FFFFFF
    - FRAME "Frame 3"  358x60  layout=HORIZONTAL  gap=12
      - FRAME "CTA"  173x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
        fill: #FF6C02
        effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
        - TEXT "End the day"  81x14
          text: "End the day"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
      - FRAME "CTA"  173x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
        fill: #000000
        effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
        - TEXT "Cancel"  46x14
          text: "Cancel"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF

## Assets used

_none_

## Wiring

| node id | node name | trigger | target id |
| --- | --- | --- | --- |
| `270:1634` | CTA | ON_CLICK | `270:1649` |
| `270:1634` | CTA | transitionNodeID | `270:1649` |
| `270:1646` | CTA | ON_CLICK | `271:1932` |
| `270:1646` | CTA | transitionNodeID | `271:1932` |
| `332:5211` | CTA | ON_CLICK | `270:1471` |
| `332:5211` | CTA | transitionNodeID | `270:1471` |
| `I332:5137;287:3467;185:1610` | House | ON_CLICK | `185:1614` |
| `I332:5137;287:3467;185:1610` | House | transitionNodeID | `185:1614` |
| `I332:5137;325:1579` | tab-hotspot-players | ON_CLICK | `287:3435` |
| `I332:5137;325:1579` | tab-hotspot-players | transitionNodeID | `287:3435` |
