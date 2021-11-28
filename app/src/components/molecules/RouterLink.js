import { Link as MaterialLink } from '@material-ui/core';
import React from 'react';
import { Link } from 'react-router-dom';

export default function RouterLink({ to, children }) {
  return <MaterialLink component={Link} to={to}>{children}</MaterialLink>;
}
