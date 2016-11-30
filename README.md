# elm-static-html


Turn an Elm app into a static HTML site.


Your modules must look like this:


```elm
module Main exposing (..)

import Html
import Html.Attributes exposing (class, href)

view : Html.Html
view =
    Html.div []
        [ Html.h1 [ class "hello" ] [ Html.text "new!" ]
        , Html.a [ href "/login" ] [ Html.text "Login" ]
        , Html.text "hello"
        ]

```

then you can use

```bash

elm-static-html --filename Main.elm --output index.html

```

which will produce

```html
<div><h1 class="hello">new!</h1><a href="/login">Login</a>hello</div>
```


## Notes

An .elm-static-html folder is created in order to generate the correct HTML and JS needed. You can delete it if you want, but it'll make builds a little slower.
