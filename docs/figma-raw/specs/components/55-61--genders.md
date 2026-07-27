# Genders

- id: `55:61`
- type: COMPONENT_SET
- page: Components
- size: 169 x 116
- position: x 14, y -152

## Layout

- COMPONENT_SET "Genders"  169x116  radius=5
  stroke: #8A38F5 1px
  - COMPONENT "Gender=Male"  129x30  layout=HORIZONTAL  gap=16
    - FRAME "Male"  48x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
      fill: #039BE5
      - TEXT "Male"  32x14
        text: "Male"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #FFFFFF
    - FRAME "Female"  65x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
      - TEXT "Female"  49x14
        text: "Female"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #000000
  - COMPONENT "Gender=Female"  129x30  layout=HORIZONTAL  gap=16
    - FRAME "Male"  48x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
      - TEXT "Male"  32x14
        text: "Male"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #000000
    - FRAME "Female"  65x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
      fill: #E876A0
      - TEXT "Female"  49x14
        text: "Female"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #FFFFFF

## Assets used

_none_

## Wiring

| node id | node name | trigger | target id |
| --- | --- | --- | --- |
| `55:58` | Female | ON_CLICK | `55:62` |
| `55:58` | Female | transitionNodeID | `55:62` |
| `55:62` | Gender=Female | ON_CLICK | `55:60` |
| `55:62` | Gender=Female | transitionNodeID | `55:60` |
