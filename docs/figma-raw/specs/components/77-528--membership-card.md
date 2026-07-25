# Membership Card

- id: `77:528`
- type: COMPONENT_SET
- page: Components
- size: 1151 x 986
- position: x 622, y -677

## Layout

- COMPONENT_SET "Membership Card"  1151x986  radius=5
  stroke: #8A38F5 1px
  - COMPONENT "Role=Default"  357x222  layout=VERTICAL  gap=10  pad=93/166/93/166  radius=16
    fill: GRADIENT_LINEAR #FCFCFC -> #AEB4BC
    stroke: #000000 2px
    effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
    - TEXT "Your role is"  86x16
      text: "Your role is"
      font: Grandstander / Grandstander-Regular 16px w400 lh auto
      fill: #000000
    - TEXT "?"  25x35
      text: "?"
      font: Grandstander / Grandstander-Black 48px w900 lh auto
      fill: #000000
    - TEXT "Peel to reveal"  158x24
      text: "Peel to reveal"
      font: Grandstander / Grandstander-Regular 24px w400 lh auto
      fill: #000000
    - FRAME "Frame 1"  28x28
      - RECTANGLE "Rectangle 1"  28x28
        fill: #AEB4BC
        stroke: #000000 2px
      - VECTOR "Rectangle 2"  28x28
        fill: #AEB4BC
        fill: #000000 @ 60%
        stroke: #000000 2px
  - COMPONENT "Role=Citizen"  357x222  radius=16
    fill: GRADIENT_LINEAR #FCFCFC -> #D1CFC7
    stroke: #000000 2px
    effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
    - TEXT "Your role is"  86x16
      text: "Your role is"
      font: Grandstander / Grandstander-Regular 16px w400 lh auto
      fill: #5C4B0D
    - TEXT "Citizen"  162x48
      text: "Citizen"
      font: Grandstander / Grandstander-Black 48px w900 lh auto
      fill: #5C4B0D
    - TEXT "Work together to execute the mafia members"  266x12
      text: "Work together to execute the mafia members"
      font: Grandstander / Grandstander-Regular 12px w400 lh auto
      fill: #5C4B0D
    - RECTANGLE "image 1"  78x78
      fill: image fill ref=c902a3b3d46083910bbe4456df8c6578df605dac
  - COMPONENT "Role=Hunter"  357x222  radius=16
    fill: GRADIENT_LINEAR #FCFCFC -> #A9B8A4
    stroke: #000000 2px
    effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
    - TEXT "Your role is"  86x16
      text: "Your role is"
      font: Grandstander / Grandstander-Regular 16px w400 lh auto
      fill: #204B12
    - TEXT "Hunter"  154x48
      text: "Hunter"
      font: Grandstander / Grandstander-Black 48px w900 lh auto
      fill: #204B12
    - TEXT "When killed, take a player down with you"  266x12
      text: "When killed, take a player down with you"
      font: Grandstander / Grandstander-Regular 12px w400 lh auto
      fill: #204B12
    - RECTANGLE "image 1"  78x78
      fill: image fill ref=44e37d54633fe164707367837d27e0606ce9e149
  - COMPONENT "Role=Doctor"  357x222  radius=16
    fill: GRADIENT_LINEAR #FCFCFC -> #B3D1D6
    stroke: #000000 2px
    effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
    - TEXT "Your role is"  86x16
      text: "Your role is"
      font: Grandstander / Grandstander-Regular 16px w400 lh auto
      fill: #1E5C67
    - TEXT "Doctor"  151x48
      text: "Doctor"
      font: Grandstander / Grandstander-Black 48px w900 lh auto
      fill: #1E5C67
    - TEXT "Save a citizen from the wrath of the mafia"  266x12
      text: "Save a citizen from the wrath of the mafia"
      font: Grandstander / Grandstander-Regular 12px w400 lh auto
      fill: #1E5C67
    - RECTANGLE "image 1"  78x78
      fill: image fill ref=223f4adca0b911c1335b652cd6192fa357ebc220
  - COMPONENT "Role=Joker"  357x222  radius=16
    fill: GRADIENT_LINEAR #FCFCFC -> #C9B9D0
    stroke: #000000 2px
    effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
    - TEXT "Your role is"  86x16
      text: "Your role is"
      font: Grandstander / Grandstander-Regular 16px w400 lh auto
      fill: #511E67
    - TEXT "Joker"  130x48
      text: "Joker"
      font: Grandstander / Grandstander-Black 48px w900 lh auto
      fill: #511E67
    - TEXT "Win by getting executed during the day vote"  266x12
      text: "Win by getting executed during the day vote"
      font: Grandstander / Grandstander-Regular 12px w400 lh auto
      fill: #511E67
    - RECTANGLE "image 1"  78x78
      fill: image fill ref=f0e46bd39f0411658158f36620061035623685ed
  - COMPONENT "Role=Detective"  357x222  radius=16
    fill: GRADIENT_LINEAR #FCFCFC -> #F9F9B4
    stroke: #000000 2px
    effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
    - TEXT "Your role is"  86x16
      text: "Your role is"
      font: Grandstander / Grandstander-Regular 16px w400 lh auto
      fill: #93791D
    - TEXT "Detective"  217x48
      text: "Detective"
      font: Grandstander / Grandstander-Black 48px w900 lh auto
      fill: #93791D
    - TEXT "Investigate players to find the hiding mafia"  266x12
      text: "Investigate players to find the hiding mafia"
      font: Grandstander / Grandstander-Regular 12px w400 lh auto
      fill: #93791D
    - RECTANGLE "image 1"  78x78
      fill: image fill ref=469ed27d0871335a640e9f0b3152a2600f14392f
  - COMPONENT "Role=Vigilante"  357x222  radius=16
    fill: GRADIENT_LINEAR #FCFCFC -> #CDB198
    stroke: #000000 2px
    effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
    - TEXT "Your role is"  86x16
      text: "Your role is"
      font: Grandstander / Grandstander-Regular 16px w400 lh auto
      fill: #67401E
    - TEXT "Vigilante"  213x48
      text: "Vigilante"
      font: Grandstander / Grandstander-Black 48px w900 lh auto
      fill: #67401E
    - TEXT "You have one bullet you can use the entire game"  286x12
      text: "You have one bullet you can use the entire game"
      font: Grandstander / Grandstander-Regular 12px w400 lh auto
      fill: #67401E
    - RECTANGLE "image 1"  78x78
      fill: image fill ref=4cc1c61e57c046fa217093798af4da32356c1422
  - COMPONENT "Role=Dead"  357x222  radius=16
    fill: GRADIENT_LINEAR #FCFCFC -> #AEB4BC
    stroke: #000000 2px
    effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
    - TEXT "You are"  57x16
      text: "You are"
      font: Grandstander / Grandstander-Regular 16px w400 lh auto
      fill: #000000
    - TEXT "DEAD"  110x48
      text: "DEAD"
      font: Grandstander / Grandstander-Black 48px w900 lh auto
      fill: #000000
    - TEXT "Stay quiet and continue to watch the town"  253x12
      text: "Stay quiet and continue to watch the town"
      font: Grandstander / Grandstander-Regular 12px w400 lh auto
      fill: #000000
    - RECTANGLE "image 1"  78x78
      fill: image fill ref=f454dffb335ab346b3912d35e9b533fdc0188622
  - COMPONENT "Role=Mafia"  357x222  radius=16
    fill: GRADIENT_LINEAR #FCFCFC -> #DC998F
    stroke: #000000 2px
    effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
    - TEXT "Your role is"  86x16
      text: "Your role is"
      font: Grandstander / Grandstander-Regular 16px w400 lh auto
      fill: #67281E
    - TEXT "Mafia"  130x48
      text: "Mafia"
      font: Grandstander / Grandstander-Black 48px w900 lh auto
      fill: #67281E
    - TEXT "Eliminate citizens until you outnumber them"  266x12
      text: "Eliminate citizens until you outnumber them"
      font: Grandstander / Grandstander-Regular 12px w400 lh auto
      fill: #67281E
    - RECTANGLE "image 1"  78x78
      fill: image fill ref=6252da56cc3d69ce983ec5aa7ba8be590e2665c9
  - COMPONENT "Role=Godfather"  357x222  radius=16
    fill: GRADIENT_LINEAR #FCFCFC -> #DC998F
    stroke: #000000 2px
    effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
    - TEXT "Your role is"  86x16
      text: "Your role is"
      font: Grandstander / Grandstander-Regular 16px w400 lh auto
      fill: #67281E
    - TEXT "Godfather"  234x48
      text: "Godfather"
      font: Grandstander / Grandstander-Black 48px w900 lh auto
      fill: #67281E
    - TEXT "Appear as innocent to the detective - eliminate the citizens til you outnumber them"  286x24
      text: "Appear as innocent to the detective - eliminate the citizens til you outnumber them"
      font: Grandstander / Grandstander-Regular 12px w400 lh 12px
      fill: #67281E
    - RECTANGLE "image 1"  78x78
      fill: image fill ref=8873033acd53f17db0c8fea79535c0eaa8358e60

## Assets used

- `223f4adca0b911c1335b652cd6192fa357ebc220` -> assets/fills/223f4adca0b911c1335b652cd6192fa357ebc220.png
- `44e37d54633fe164707367837d27e0606ce9e149` -> assets/fills/44e37d54633fe164707367837d27e0606ce9e149.png
- `469ed27d0871335a640e9f0b3152a2600f14392f` -> assets/fills/469ed27d0871335a640e9f0b3152a2600f14392f.png
- `4cc1c61e57c046fa217093798af4da32356c1422` -> assets/fills/4cc1c61e57c046fa217093798af4da32356c1422.png
- `6252da56cc3d69ce983ec5aa7ba8be590e2665c9` -> assets/fills/6252da56cc3d69ce983ec5aa7ba8be590e2665c9.png
- `8873033acd53f17db0c8fea79535c0eaa8358e60` -> assets/fills/8873033acd53f17db0c8fea79535c0eaa8358e60.png
- `c902a3b3d46083910bbe4456df8c6578df605dac` -> assets/fills/c902a3b3d46083910bbe4456df8c6578df605dac.png
- `f0e46bd39f0411658158f36620061035623685ed` -> assets/fills/f0e46bd39f0411658158f36620061035623685ed.png
- `f454dffb335ab346b3912d35e9b533fdc0188622` -> assets/fills/f454dffb335ab346b3912d35e9b533fdc0188622.png

## Wiring

_none_
