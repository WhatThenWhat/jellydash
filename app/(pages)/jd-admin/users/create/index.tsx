'use client';

import { toast } from '@/components/breeze-ui/toast/hooks/use-toast';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { useMutationHandler } from '@/hooks/useMutationHandler';
import type { CreateUserResponse } from '@/lib/shared/types';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import UsersPage from '..';
import FormFields from './components/formFields';
import FormFooter from './components/formFooter';
import { CreateUserPayloadType, formValidationRules } from './formValidations';

const defaultValues = {
  Username: '',
  Pw: '',
  Package: ''
};

export default function CreateUser() {
  const [password, setPassword] = useState('');

  const form = useForm<CreateUserPayloadType>({
    resolver: zodResolver(formValidationRules),
    mode: 'onChange',
    defaultValues
  });

  const { control, handleSubmit } = form;

  const createUser = useMutationHandler<CreateUserPayloadType, CreateUserResponse>({
    mutationKey: 'users-new',
    endpoint: 'users/new',
    invalidateQueryKeys: ['users-all', 'groups']
  });

  useEffect(() => {
    if (!createUser.isSuccess || !createUser.data) return;
    setPassword(createUser.data.Pw);
    const warnings = createUser.data.warnings ?? [];
    toast({
      title: 'User created successfully',
      description: warnings.length
        ? `Created, with ${warnings.length} cosmetic setting(s) skipped: ${warnings.join('; ')}`
        : 'Users table has been updated',
      variant: warnings.length ? 'info' : 'success',
      duration: 6000
    });
    form.reset({ ...defaultValues });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createUser.isSuccess, createUser.data]);

  return (
    <Card className="flex flex-col xl:flex-row w-full">
      <div className="flex flex-col gap-10 p-10">
        <CardHeader className="p-0">
          <CardTitle>Create a new user</CardTitle>
          <CardDescription>
            Create a user on the selected server and apply an access group
          </CardDescription>
        </CardHeader>

        <Form {...form}>
          <form
            onSubmit={handleSubmit((formData) => {
              setPassword('');
              createUser.mutate(formData);
            })}
            className="flex flex-col flex-auto bg-info rounded-2xl gap-4 max-w-sm mx-auto"
          >
            <FormFields control={control} isPending={createUser.isPending} />

            <FormFooter
              isPending={createUser.isPending}
              Pw={password}
              control={control}
              isError={createUser.isError}
              errorMessage={`${createUser.error?.message}`}
              isSuccess={createUser.isSuccess}
            />
          </form>
        </Form>
      </div>

      <div className="flex flex-col w-full">
        <UsersPage />
      </div>
    </Card>
  );
}
