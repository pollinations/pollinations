import { Model } from './Model';
import React, { useEffect, useMemo, useState } from 'react';

import {Container} from "@material-ui/core"

import "./network/connectToLocalColab";
import notebooks from "./data/notebooks.json";

function App() {


   return (
      <Container maxWidth="sm">
        {
          notebooks.map((notebook,i) => (
          <Model key={i} notebook={notebook} />
          ))
        }
        </Container>
    );
}

export default App;
