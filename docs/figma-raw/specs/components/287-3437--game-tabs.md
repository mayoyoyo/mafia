# Game Tabs

- id: `287:3437`
- type: COMPONENT_SET
- page: Components
- size: 775 x 294
- position: x 209, y 370

## Layout

- COMPONENT_SET "Game Tabs"  775x294  radius=5
  stroke: #8A38F5 1px
  - COMPONENT "Position=Events"  358x254  layout=VERTICAL  gap=10  pad=16  radius=16
    fill: #FFFFFF
    stroke: #000000 2px
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
          fill: #000000
    - FRAME "Round 01"  326x14  layout=HORIZONTAL  gap=10
      - TEXT "Round 1"  52x14
        text: "Round 1"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #000000
      - TEXT "jenny - died in the night"  169x14
        text: "jenny - died in the night"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #000000
    - LINE "Divider"  326x0
      stroke: #000000 1px
    - FRAME "Round 02"  326x36  layout=HORIZONTAL  gap=10
      - TEXT "Round 2"  53x14
        text: "Round 2"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #000000
      - FRAME "Frame 22"  159x36  layout=VERTICAL  gap=8
        - TEXT "kevin - saved by doctor"  159x14
          text: "kevin - saved by doctor"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #000000
        - TEXT "mo - executed by vote"  152x14
          text: "mo - executed by vote"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #000000
    - LINE "Divider"  326x0
      stroke: #000000 1px
    - FRAME "Round 03"  326x14  layout=HORIZONTAL  gap=10
      - TEXT "Round 3"  54x14
        text: "Round 3"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #000000
      - TEXT "dale - shot by vigilante"  160x14
        text: "dale - shot by vigilante"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #000000
    - LINE "Divider"  326x0
      stroke: #000000 1px
    - FRAME "Round 04"  326x58  layout=HORIZONTAL  gap=10
      - TEXT "Round 4"  54x14
        text: "Round 4"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #000000
      - FRAME "Frame 22"  221x58  layout=VERTICAL  gap=8
        - TEXT "kevin - haunted by the joker"  194x14
          text: "kevin - haunted by the joker"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #000000
        - TEXT "natasha - shot by the hunter"  198x14
          text: "natasha - shot by the hunter"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #000000
        - TEXT "chirstopher - died of heartbreak"  221x14
          text: "chirstopher - died of heartbreak"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #000000
    - RECTANGLE "tab-hotspot-players"  163x30  radius=15
      fill: #FFFFFF @ 0%
  - COMPONENT "Position=Players"  358x206  layout=VERTICAL  gap=10  pad=16  radius=16
    fill: #FFFFFF
    stroke: #000000 2px
    effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
    - INSTANCE "Tabs"  326x30  layout=HORIZONTAL  gap=16  instance of `185:1614` "Toggle=Right" of set "Tabs"
      - FRAME "Official"  155x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
        - TEXT "Events"  44x14
          text: "Events"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #000000
      - FRAME "House"  155x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
        fill: #FF6C02
        - TEXT "Players"  49x14
          text: "Players"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
    - FRAME "dale"  326x14  layout=HORIZONTAL  gap=10  opacity=30%
      - TEXT "dale"  30x14
        text: "dale"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #000000
      - ELLIPSE "Ellipse 16"  14x14
        fill: #E53935
    - FRAME "mo"  326x14  layout=HORIZONTAL  gap=10
      - TEXT "mo"  22x14
        text: "mo"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #000000
      - ELLIPSE "Ellipse 16"  14x14
        fill: #AB47BC
    - FRAME "jenny"  326x14  layout=HORIZONTAL  gap=10
      - TEXT "jenny"  39x14
        text: "jenny"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #000000
      - ELLIPSE "Ellipse 16"  14x14
        fill: #218BE1
    - FRAME "kevin"  326x14  layout=HORIZONTAL  gap=10
      - TEXT "kevin"  37x14
        text: "kevin"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #000000
      - ELLIPSE "Ellipse 16"  14x14
        fill: #546E7A
    - FRAME "natasha"  326x14  layout=HORIZONTAL  gap=10  opacity=30%
      - TEXT "natasha"  57x14
        text: "natasha"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #000000
      - ELLIPSE "Ellipse 16"  14x14
        fill: #66BB6A
    - FRAME "christopher"  326x14  layout=HORIZONTAL  gap=10
      - TEXT "christopher"  77x14
        text: "christopher"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #000000
      - ELLIPSE "Ellipse 16"  14x14
        fill: #FFEE58
    - RECTANGLE "tab-hotspot-events"  163x30  radius=15
      fill: #FFFFFF @ 0%

## Assets used

_none_

## Wiring

| node id | node name | trigger | target id |
| --- | --- | --- | --- |
| `325:1579` | tab-hotspot-players | ON_CLICK | `287:3435` |
| `325:1579` | tab-hotspot-players | transitionNodeID | `287:3435` |
| `325:1585` | tab-hotspot-events | ON_CLICK | `287:3436` |
| `325:1585` | tab-hotspot-events | transitionNodeID | `287:3436` |
