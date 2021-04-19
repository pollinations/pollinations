import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import reportWebVitals from './reportWebVitals';
import { useSearchParam } from 'react-use';

// images
import runAllImg from "./help/Runtime-RunAll.png"; 
import colabLogoImage from "./help/colab_icon.png";
import { Box } from '@material-ui/core';
const useIsInColab = () => 
  useSearchParam('insidecolab');

const useColab = () => {
  const inColab = useIsInColab(); 
  console.log("Which Colab notebook is open?", inColab);

  // handshake with the browser when we are running in an iframe in colab
  useEffect(() => {

    const channel = new BroadcastChannel("colabservice")
    if (inColab) {
      console.log("Announcing that we are in Colab.");
      channel.postMessage("local_colab")
      window.parent.postMessage("roger_from_inside");
      window.onmessage = ({data}) => {
        console.log("innerOnMessage",data);
      }      
    } else
      channel.onmessage = ({data}) => {
        if (data === "local_colab") {
          console.log("Connected to local Colab...");
          channel.postMessage("local_frontend");
        }

    }
    
  },[inColab]);

  return inColab; 
}

const AppOnlyOutsideColab = ({children}) => {

  const inColab = useColab();
  
  return inColab ? 
                  (<><Box m={2}>
                    <h3>Welcome to <i>Better name? CaaS? Blatant Pollinations?</i></h3>
                      <h4>Please click <i>Runtime->Run all</i> to start the backend.</h4> 
                   
                        <img src={runAllImg} width="300" height="auto" />     <br/>
                        <br/>
                        Although the preview frontend is also shown from inside of Google Colab, it is usually preferable to open it in a separate browser window.   Please follow <a href="https://voodoohop.github.io/colabasaservice/" target="_blank">this</a> link.
                        </Box>
                        <br/>
                        <br/>
                        {children}
                        </>) : (<div>

                    {children}
                    </div>
                    );
}

ReactDOM.render(
  <React.StrictMode>
    <AppOnlyOutsideColab><App /></AppOnlyOutsideColab>
  </React.StrictMode>,
  document.getElementById('root')
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://cra.link/PWA
serviceWorkerRegistration.unregister();

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
