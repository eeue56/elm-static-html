module Main exposing (..)

import Html
import Html.Attributes exposing (class, href)


view =
    Html.div []
        [ Html.h1 [ class "hello" ] [ Html.text "new!" ]
        , Html.a [ href "/login" ] [ Html.text "Login" ]
        , Html.text "hello"
        ]
