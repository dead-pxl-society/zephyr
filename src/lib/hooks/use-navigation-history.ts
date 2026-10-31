import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const useNavigationHistory = () => {
	const [canGoBack, setCanGoBack] = useState(false);
	const [canGoForward, setCanGoForward] = useState(false);
	const navigate = useNavigate();
	const location = useLocation();

	useEffect(() => {
		const handlePopState = () => {
			setCanGoBack(window.history.state?.idx > 0);
			setCanGoForward(window.history.state?.idx < window.history.length - 1);
		};

		window.addEventListener("popstate", handlePopState);
		handlePopState();

		return () => {
			window.removeEventListener("popstate", handlePopState);
		};
	}, [location]);

	return { canGoBack, canGoForward, navigate, pathname: location.pathname };
};

export default useNavigationHistory;
