import { createBrowserRouter } from "react-router-dom";
import IMHome from "../pages/IMHome";
import IMUpload from "../pages/IMUpload";
import IMProtectedRoute from "../component/IMProtectedRoute";
import IMLogin from "../pages/IMLogin";
import IMMainLayout from "../component/IMMainLayout";
import IMBankMapping from "../pages/IMBankMapping";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <IMLogin />,
  },
  {
    element: (
      <IMProtectedRoute>
        <IMMainLayout />
      </IMProtectedRoute>
    ),
    children: [
      {
        path: "/",
        element: <IMHome />,
      },
      {
        path: "/upload",
        element: <IMUpload />,
      },
      {
        path: "/bank-mapping",
        element: <IMBankMapping />,
      },
    ],
  },
]);
