import { Link as MaterialLink } from '@material-ui/core';
import React from 'react';
import { Link } from 'react-router-dom';

export default function RouterLink({ to, children, ...rest }) {
  return <MaterialLink component={Link} to={to} {...rest}>{children}</MaterialLink>;
}
