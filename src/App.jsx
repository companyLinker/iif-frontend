import { router } from "./routing";
import { RouterProvider } from "react-router-dom";
import "remixicon/fonts/remixicon.css";
import "./App.css";

function App() {
  return (
    <>
      <RouterProvider router={router} />
    </>
  );
}

export default App;
