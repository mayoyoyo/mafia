# Lobby / Roles in Play

- id: `268:640`
- type: FRAME
- section: Game Menu
- size: 390 x 844
- position: x 1950, y 5769

## Layout

- FRAME "Lobby / Roles in Play"  390x844  radius=16
  fill: #000000
  - FRAME "Container"  358x666  layout=VERTICAL  gap=32
    - FRAME "Nav"  358x24  layout=HORIZONTAL  gap=118
      - TEXT "Lobby"  45x16
        text: "Lobby"
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
    - TEXT "Waiting for host to start..."  358x24
      text: "Waiting for host to start..."
      font: Grandstander / Grandstander-Regular 24px w400 lh auto
      fill: #FFFFFF
    - FRAME "Roles"  358x94  layout=VERTICAL  gap=10  pad=16  radius=16
      fill: #232729
      stroke: #FFFFFF 2px
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - FRAME "Frame 8"  326x14  layout=HORIZONTAL  gap=10
        - TEXT "Mafia members"  105x14
          text: "Mafia members"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - TEXT "2"  7x14
          text: "2"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
      - LINE "Line 1"  326x0
        stroke: #FFFFFF 1px
      - FRAME "Frame 9"  326x28  layout=HORIZONTAL  gap=10
        - TEXT "Special Roles"  90x14
          text: "Special Roles"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - TEXT "Doctor, Detective, Hunter, Joker"  177x28
          text: "Doctor, Detective, Hunter, Joker "
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
    - FRAME "Players"  358x200  layout=VERTICAL  gap=10  pad=16  radius=16
      fill: #232729
      stroke: #FFFFFF 2px
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - FRAME "Frame 8"  326x14  layout=HORIZONTAL  gap=10
        - TEXT "Players"  49x14
          text: "Players"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - TEXT "6/20"  30x14
          text: "6/20"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
      - LINE "Line 1"  326x0
        stroke: #FFFFFF 1px
      - FRAME "Frame 9"  326x14  layout=HORIZONTAL  gap=10
        - FRAME "Frame 19"  91x14  layout=HORIZONTAL  gap=4
          - TEXT "dale (host)"  73x14
            text: "dale (host)"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
          - INSTANCE "Star"  14x14  instance of `42:922` "Star"
            - VECTOR "Icon"  11.67x11.1
              stroke: #FFFFFF 1.6px
        - ELLIPSE "Ellipse 16"  14x14
          fill: #E53935
      - FRAME "Frame 10"  326x14  layout=HORIZONTAL  gap=10
        - TEXT "mo"  22x14
          text: "mo"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - ELLIPSE "Ellipse 16"  14x14
          fill: #AB47BC
      - FRAME "Frame 11"  326x14  layout=HORIZONTAL  gap=10
        - TEXT "jenny"  39x14
          text: "jenny"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - ELLIPSE "Ellipse 16"  14x14
          fill: #218BE1
      - FRAME "Frame 12"  326x14  layout=HORIZONTAL  gap=10
        - TEXT "kevin"  37x14
          text: "kevin"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - ELLIPSE "Ellipse 16"  14x14
          fill: #546E7A
      - FRAME "Frame 13"  326x14  layout=HORIZONTAL  gap=10
        - TEXT "natasha"  57x14
          text: "natasha"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - ELLIPSE "Ellipse 16"  14x14
          fill: #66BB6A
      - FRAME "Frame 14"  326x14  layout=HORIZONTAL  gap=10
        - TEXT "christopher"  77x14
          text: "christopher"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - ELLIPSE "Ellipse 16"  14x14
          fill: #FFEE58
    - FRAME "Colors"  358x196  layout=VERTICAL  gap=16  pad=16  radius=16
      fill: #232729
      stroke: #FFFFFF 2px
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - FRAME "Frame 8"  326x14  layout=HORIZONTAL  gap=10
        - TEXT "Choose your color"  120x14
          text: "Choose your color"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
      - FRAME "Frame 15"  326x34  layout=HORIZONTAL  gap=24
        - ELLIPSE "Ellipse"  34x34
          fill: #E53935
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #E876A0
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #8E24AA
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #5E35B1
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #3949AB
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #1E88E5
          stroke: #FFFFFF 2px
      - FRAME "Frame 16"  326x34  layout=HORIZONTAL  gap=24
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #039BE5
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #00ACC1
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #00897B
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #43A047
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #7CB342
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #C0CA33
          stroke: #FFFFFF 2px
      - FRAME "Frame 18"  326x34  layout=HORIZONTAL  gap=24
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #FDD835
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #FFB300
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #FB8C00
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #F4511E
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #6D4C41
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #757575
          stroke: #FFFFFF 2px
  - RECTANGLE "Rectangle 2"  390x844  opacity=30%
    fill: #000000
  - FRAME "Players"  390x280  layout=VERTICAL  gap=10  pad=16  radius=16
    fill: #232729
    effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
    - FRAME "Title"  358x32  layout=HORIZONTAL  gap=10
      - TEXT "Roles in Play"  147x24
        text: "Roles in Play"
        font: Grandstander / Grandstander-Regular 24px w400 lh auto
        fill: #FFFFFF
      - FRAME "X"  32x32  radius=100
        - INSTANCE "X"  20x20  instance of `135:553` "Size=20" of set "X"
          - VECTOR "Icon"  10x10
            stroke: #FFFFFF 2px
    - FRAME "Mafia"  358x62  layout=HORIZONTAL  gap=10  pad=16/0/16/0
      stroke: #FFFFFF 1px
      - FRAME "Female"  54x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
        fill: #DC998F
        - TEXT "Mafia"  38x14
          text: "Mafia"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #67281E
      - TEXT "x 2"  25x18
        text: "x 2"
        font: Grandstander / Grandstander-Regular 18px w400 lh auto
        fill: #FFFFFF
    - FRAME "Doctor"  358x62  layout=HORIZONTAL  gap=10  pad=16/0/16/0
      stroke: #FFFFFF 1px
      - FRAME "Tag"  61x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
        fill: #B3D1D6
        - TEXT "Doctor"  45x14
          text: "Doctor"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #1E5C67
      - TEXT "x 1"  24x18
        text: "x 1"
        font: Grandstander / Grandstander-Regular 18px w400 lh auto
        fill: #FFFFFF
    - FRAME "Detective"  358x62  layout=HORIZONTAL  gap=10  pad=16/0/16/0
      - FRAME "Tag"  79x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
        fill: #F9F9B4
        - TEXT "Detective"  63x14
          text: "Detective"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #93791D
      - TEXT "x 1"  24x18
        text: "x 1"
        font: Grandstander / Grandstander-Regular 18px w400 lh auto
        fill: #FFFFFF

## Assets used

_none_

## Wiring

| node id | node name | trigger | target id |
| --- | --- | --- | --- |
| `268:651` | Settings | ON_CLICK | `268:640` |
| `268:651` | Settings | transitionNodeID | `268:640` |
| `268:714` | X | ON_CLICK | `42:782` |
| `268:714` | X | transitionNodeID | `42:782` |
