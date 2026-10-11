'use client';

import { useToast } from '@/components/breeze-ui/toast/hooks/use-toast';
import { Form } from '@/components/ui/form';

import { zodResolver } from '@hookform/resolvers/zod';
import { signIn } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import LoginPage01 from './components/form';
import { formValidationRules, LoginPayloadType } from './formValidations';

export default function Login() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof formValidationRules>>({
    resolver: zodResolver(formValidationRules),
    mode: 'onChange'
  });

  const onSubmit = async (formData: LoginPayloadType) => {
    setIsLoading(true);

    const result = await signIn('credentials', {
      username: formData.Username,
      password: formData.Pw,
      redirect: false
    });

    if (result?.error) {
      toast({
        title: 'Login Failed',
        description: 'Wrong username or password, or too many failed attempts. Wait 15 minutes if locked out.',
        variant: 'destructive'
      });
      setIsLoading(false);
    } else {
      redirect('/jd-admin');
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col flex-auto bg-info rounded-2xl gap-4 max-w-xl mx-auto justify-center min-h-screen"
      >
        <LoginPage01
          backgroundImage="/Splashscreen.jpeg"
          companyLogo="/logo.webp"
          companyLogoAlt="Jellydash Logo"
          formWidth={300}
          providers={['jellyfin']}
          title="Jellyfin Management Dashboard"
          loading={isLoading}
          control={form.control}
        />
      </form>
    </Form>
  );
}
