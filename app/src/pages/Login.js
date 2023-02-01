import useLogin from '../hooks/forms/useLogin'
import SimpleForm from "../components/SimpleForm";

export default function LoginPage(){

const LoginProps = useLogin()

return <SimpleForm {...LoginProps} title='SignIn'/>
}